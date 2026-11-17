#!/usr/bin/env python3
"""HTTP entry point cho worker yt-dlp + Whisper local."""

import json
import hmac
import os
import sys
import tempfile
import time
import signal
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .captions import caption_candidates, caption_extension, fetch_caption, parse_caption
from .errors import JobCancelled, JobDeadlineExceeded, WorkerError
from .job_store import JobStore
from .metrics import Metrics
from .platforms import platform_for
from .rate_limiter import RateLimiter
from .retry_policy import RETRYABLE_JOB_ERRORS
from .transcriber import run_command, transcribe_audio

YTDLP = os.getenv("YTDLP_BINARY", "yt-dlp")
FFMPEG = os.getenv("FFMPEG_BINARY", "ffmpeg")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WORKER_AUTH_TOKEN = os.getenv("WORKER_AUTH_TOKEN", "").strip()
MAX_VIDEO_DURATION_SECONDS = int(os.getenv("MAX_VIDEO_DURATION_SECONDS", "7200"))
MAX_CAPTION_BYTES = int(os.getenv("MAX_CAPTION_BYTES", str(5 * 1024 * 1024)))
MAX_JOB_ATTEMPTS = int(os.getenv("MAX_JOB_ATTEMPTS", "2"))
JOB_DEADLINE_SECONDS = int(os.getenv("JOB_DEADLINE_SECONDS", "900"))
JOB_STALE_SECONDS = int(os.getenv("JOB_STALE_SECONDS", "120"))
JOB_STORE = JobStore(
    ttl_seconds=int(os.getenv("JOB_TTL_SECONDS", "3600")),
    max_jobs=int(os.getenv("MAX_JOBS", "100")),
    db_path=os.getenv("JOB_DB_PATH", "worker/data/jobs.sqlite3"),
)
SUBMISSION_RATE_LIMITER = RateLimiter(
    limit=int(os.getenv("MAX_SUBMISSIONS_PER_WINDOW", "10")),
    window_seconds=int(os.getenv("SUBMISSION_WINDOW_SECONDS", "60")),
)
EXECUTOR = ThreadPoolExecutor(max_workers=1)
METRICS = Metrics()
HTTP_SERVER = None
SHUTDOWN_EVENT = threading.Event()
ACTIVE_JOB_IDS = set()
ACTIVE_JOB_LOCK = threading.Lock()


def fetch_info(url, should_cancel=None, deadline=None):
    output = run_command([
        YTDLP, "--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "--retries", "3", url,
    ], should_cancel, deadline)
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise WorkerError("INVALID_UPSTREAM_RESPONSE", "Nguồn video trả về dữ liệu không hợp lệ.") from error


def process_job(job_id, url, language, attempt=1):
    started_at = time.monotonic()
    lease_token = uuid.uuid4().hex
    if not JOB_STORE.claim(job_id, lease_token):
        return
    with ACTIVE_JOB_LOCK:
        ACTIVE_JOB_IDS.add(job_id)
    deadline = time.time() + JOB_DEADLINE_SECONDS
    should_cancel = lambda: SHUTDOWN_EVENT.is_set() or JOB_STORE.is_cancel_requested(job_id)
    heartbeat_stop = threading.Event()
    def heartbeat():
        while not heartbeat_stop.wait(5):
            JOB_STORE.heartbeat(job_id, lease_token)
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    heartbeat_thread.start()
    METRICS.increment("jobs_started")
    JOB_STORE.update(job_id, lease_token=lease_token, status="running", stage="fetching_metadata", attempt=attempt, deadlineAt=deadline)
    try:
        if should_cancel():
            raise JobCancelled()
        with tempfile.TemporaryDirectory(prefix="clipread-") as temp_dir:
            info = fetch_info(url, should_cancel, deadline)
            duration = float(info.get("duration") or 0)
            if duration > MAX_VIDEO_DURATION_SECONDS:
                raise WorkerError("VIDEO_TOO_LONG", "Video vượt quá thời lượng cho phép.")

            JOB_STORE.update(job_id, lease_token=lease_token, stage="checking_captions")
            segments = []
            detected_language = None
            for caption_language, caption in caption_candidates(info, language):
                if should_cancel():
                    raise JobCancelled()
                try:
                    content = fetch_caption(caption, MAX_CAPTION_BYTES, url)
                    segments = parse_caption(content, caption_extension(caption), caption_language)
                except (WorkerError, json.JSONDecodeError, UnicodeError):
                    segments = []
                if segments:
                    detected_language = caption_language
                    break

            if not segments:
                JOB_STORE.update(job_id, lease_token=lease_token, stage="downloading_audio")
                segments, detected_language = transcribe_audio(
                    url,
                    language,
                    temp_dir,
                    lambda stage: JOB_STORE.update(job_id, lease_token=lease_token, stage=stage),
                    YTDLP,
                    FFMPEG,
                    WHISPER_MODEL,
                    MAX_VIDEO_DURATION_SECONDS,
                    should_cancel,
                    deadline,
                )
            if should_cancel():
                raise JobCancelled()
            if not segments:
                raise WorkerError("NO_TRANSCRIPT", "Không tạo được transcript từ caption hoặc audio.")

            JOB_STORE.update(job_id, lease_token=lease_token, stage="finalizing")
            document = {
                "sourceUrl": url,
                "platform": platform_for(url),
                "title": info.get("title") or "Untitled video",
                "author": info.get("uploader") or info.get("channel"),
                "durationSeconds": info.get("duration"),
                "language": detected_language,
                "thumbnail": info.get("thumbnail"),
                "segments": segments,
            }
        JOB_STORE.update(job_id, lease_token=lease_token, status="completed", stage="completed", document=document)
        METRICS.increment("jobs_completed")
    except WorkerError as error:
        print(f"[worker] job failed: {error.code} - {error}", file=sys.stderr)
        if error.code == "JOB_CANCELLED":
            JOB_STORE.update(job_id, lease_token=lease_token, status="cancelled", stage="cancelled", error=str(error), code=error.code)
            METRICS.increment("jobs_cancelled")
        elif error.code in RETRYABLE_JOB_ERRORS and attempt < MAX_JOB_ATTEMPTS:
            METRICS.increment("jobs_retried")
            retry_delay = min(30, 2 ** attempt)
            JOB_STORE.update(job_id, lease_token=lease_token, status="queued", stage="queued", retryCount=attempt, attempt=attempt + 1)
            time.sleep(retry_delay)
            EXECUTOR.submit(process_job, job_id, url, language, attempt + 1)
            return
        if error.code == "JOB_TIMEOUT":
            JOB_STORE.update(job_id, lease_token=lease_token, status="failed", stage="failed", error=str(error), code=error.code)
        elif attempt >= MAX_JOB_ATTEMPTS and error.code in RETRYABLE_JOB_ERRORS:
            JOB_STORE.update(job_id, lease_token=lease_token, status="dead_letter", stage="dead_letter", error=str(error), code=error.code, deadLetter=True)
        else:
            JOB_STORE.update(job_id, lease_token=lease_token, status="failed", error=str(error), code=error.code)
        METRICS.increment("jobs_failed")
    except Exception as error:
        print(f"[worker] unexpected job failure: {type(error).__name__}: {error}", file=sys.stderr)
        JOB_STORE.update(job_id, lease_token=lease_token, status="failed", error="Worker gặp lỗi không mong muốn.", code="WORKER_ERROR")
        METRICS.increment("jobs_failed")
    finally:
        METRICS.observe("jobDuration", (time.monotonic() - started_at) * 1000)
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=1)
        with ACTIVE_JOB_LOCK:
            ACTIVE_JOB_IDS.discard(job_id)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not WORKER_AUTH_TOKEN:
            return True
        return hmac.compare_digest(
            self.headers.get("Authorization", ""),
            f"Bearer {WORKER_AUTH_TOKEN}",
        )

    def do_POST(self):
        if not self.authorized():
            self.send_json({"error": "Worker authentication required.", "code": "UNAUTHORIZED"}, 401)
            return
        if self.path.startswith("/jobs/") and self.path.endswith("/cancel"):
            job_id = self.path.removeprefix("/jobs/").removesuffix("/cancel").strip("/")
            job = JOB_STORE.request_cancel(job_id)
            self.send_json(job or {"error": "Job không tồn tại hoặc đã hết hạn.", "code": "JOB_NOT_FOUND"}, 202 if job else 404)
            return
        if self.path != "/jobs":
            self.send_json({"error": "Not found", "code": "NOT_FOUND"}, 404)
            return
        client_key = self.client_address[0]
        if not SUBMISSION_RATE_LIMITER.allow(client_key):
            METRICS.increment("requests_rate_limited")
            self.send_json(
                {"error": "Có quá nhiều yêu cầu trong thời gian ngắn.", "code": "RATE_LIMITED"},
                429,
            )
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 16_384:
                raise WorkerError("REQUEST_TOO_LARGE", "Request quá lớn.")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise WorkerError("INVALID_REQUEST", "Body request phải là một object JSON.")
            url = str(body.get("url", "")).strip()
            language = str(body.get("language", "auto"))
            if not url:
                raise WorkerError("INVALID_REQUEST", "Thiếu URL video.")
            if platform_for(url) == "unknown":
                raise WorkerError("UNSUPPORTED_PLATFORM", "Nền tảng chưa được worker hỗ trợ.")
            job = JOB_STORE.create(url, language)
            if job["status"] in ("queued", "running"):
                METRICS.increment("jobs_submitted")
                EXECUTOR.submit(process_job, job["jobId"], url, language)
            self.send_json(job, 202)
        except json.JSONDecodeError:
            self.send_json({"error": "Body request phải là JSON hợp lệ.", "code": "INVALID_REQUEST"}, 400)
        except WorkerError as error:
            self.send_json({"error": str(error), "code": error.code}, 400 if error.code != "QUEUE_FULL" else 429)

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"status": "ok", "service": "clipread-worker"})
            return
        if not self.authorized():
            self.send_json({"error": "Worker authentication required.", "code": "UNAUTHORIZED"}, 401)
            return
        if self.path == "/metrics":
            self.send_json(METRICS.snapshot())
            return
        if not self.path.startswith("/jobs/"):
            self.send_json({"error": "Not found", "code": "NOT_FOUND"}, 404)
            return
        job = JOB_STORE.get(self.path.removeprefix("/jobs/").split("/", 1)[0])
        self.send_json(job or {"error": "Job không tồn tại hoặc đã hết hạn.", "code": "JOB_NOT_FOUND"}, 200 if job else 404)

    def log_message(self, format, *args):
        return


def recover_pending_jobs():
    JOB_STORE.recover_stale(JOB_STALE_SECONDS)
    for job in JOB_STORE.pending_jobs():
        JOB_STORE.update(job["jobId"], status="queued", stage="queued")
        EXECUTOR.submit(process_job, job["jobId"], job["url"], job["language"], job.get("attempt", 1))


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1") and not WORKER_AUTH_TOKEN:
        raise SystemExit("WORKER_AUTH_TOKEN is required when HOST is not local.")
    port = int(os.getenv("PORT", "8787"))
    recover_pending_jobs()
    HTTP_SERVER = ThreadingHTTPServer((host, port), Handler)
    def shutdown(_signal, _frame):
        SHUTDOWN_EVENT.set()
        with ACTIVE_JOB_LOCK:
            for job_id in list(ACTIVE_JOB_IDS):
                JOB_STORE.request_cancel(job_id)
        threading.Thread(target=HTTP_SERVER.shutdown, daemon=True).start()
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    try:
        HTTP_SERVER.serve_forever()
    finally:
        EXECUTOR.shutdown(wait=True, cancel_futures=False)
        JOB_STORE.close()
