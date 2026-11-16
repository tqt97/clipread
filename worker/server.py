#!/usr/bin/env python3
"""HTTP entry point cho worker yt-dlp + Whisper local."""

import json
import hmac
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .captions import caption_candidates, caption_extension, fetch_caption, parse_caption
from .errors import WorkerError
from .job_store import JobStore
from .platforms import platform_for
from .transcriber import run_command, transcribe_audio

YTDLP = os.getenv("YTDLP_BINARY", "yt-dlp")
FFMPEG = os.getenv("FFMPEG_BINARY", "ffmpeg")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WORKER_AUTH_TOKEN = os.getenv("WORKER_AUTH_TOKEN", "").strip()
MAX_VIDEO_DURATION_SECONDS = int(os.getenv("MAX_VIDEO_DURATION_SECONDS", "7200"))
MAX_CAPTION_BYTES = int(os.getenv("MAX_CAPTION_BYTES", str(5 * 1024 * 1024)))
JOB_STORE = JobStore(
    ttl_seconds=int(os.getenv("JOB_TTL_SECONDS", "3600")),
    max_jobs=int(os.getenv("MAX_JOBS", "100")),
)
EXECUTOR = ThreadPoolExecutor(max_workers=1)


def fetch_info(url):
    output = run_command([
        YTDLP, "--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "--retries", "3", url,
    ])
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise WorkerError("INVALID_UPSTREAM_RESPONSE", "Nguồn video trả về dữ liệu không hợp lệ.") from error


def process_job(job_id, url, language):
    JOB_STORE.update(job_id, status="running", stage="fetching_metadata")
    try:
        with tempfile.TemporaryDirectory(prefix="clipread-") as temp_dir:
            info = fetch_info(url)
            duration = float(info.get("duration") or 0)
            if duration > MAX_VIDEO_DURATION_SECONDS:
                raise WorkerError("VIDEO_TOO_LONG", "Video vượt quá thời lượng cho phép.")

            JOB_STORE.update(job_id, stage="checking_captions")
            segments = []
            detected_language = None
            for caption_language, caption in caption_candidates(info, language):
                try:
                    content = fetch_caption(caption, MAX_CAPTION_BYTES, url)
                    segments = parse_caption(content, caption_extension(caption), caption_language)
                except (WorkerError, json.JSONDecodeError, UnicodeError):
                    segments = []
                if segments:
                    detected_language = caption_language
                    break

            if not segments:
                JOB_STORE.update(job_id, stage="downloading_audio")
                segments, detected_language = transcribe_audio(
                    url,
                    language,
                    temp_dir,
                    lambda stage: JOB_STORE.update(job_id, stage=stage),
                    YTDLP,
                    FFMPEG,
                    WHISPER_MODEL,
                    MAX_VIDEO_DURATION_SECONDS,
                )
            if not segments:
                raise WorkerError("NO_TRANSCRIPT", "Không tạo được transcript từ caption hoặc audio.")

            JOB_STORE.update(job_id, stage="finalizing")
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
        JOB_STORE.update(job_id, status="completed", stage="completed", document=document)
    except WorkerError as error:
        print(f"[worker] job failed: {error.code} - {error}", file=sys.stderr)
        JOB_STORE.update(job_id, status="failed", error=str(error), code=error.code)
    except Exception as error:
        print(f"[worker] unexpected job failure: {type(error).__name__}: {error}", file=sys.stderr)
        JOB_STORE.update(job_id, status="failed", error="Worker gặp lỗi không mong muốn.", code="WORKER_ERROR")


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
        if self.path != "/jobs":
            self.send_json({"error": "Not found", "code": "NOT_FOUND"}, 404)
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
            job = JOB_STORE.create()
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
        if not self.path.startswith("/jobs/"):
            self.send_json({"error": "Not found", "code": "NOT_FOUND"}, 404)
            return
        job = JOB_STORE.get(self.path.removeprefix("/jobs/").split("/", 1)[0])
        self.send_json(job or {"error": "Job không tồn tại hoặc đã hết hạn.", "code": "JOB_NOT_FOUND"}, 200 if job else 404)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1") and not WORKER_AUTH_TOKEN:
        raise SystemExit("WORKER_AUTH_TOKEN is required when HOST is not local.")
    port = int(os.getenv("PORT", "8787"))
    ThreadingHTTPServer((host, port), Handler).serve_forever()
