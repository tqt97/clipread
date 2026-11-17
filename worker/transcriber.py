import re
import subprocess
import sys
import threading
import time
from multiprocessing import Process, Queue
from queue import Empty
from pathlib import Path
from tempfile import TemporaryFile

from .errors import JobCancelled, JobDeadlineExceeded, WorkerError
from .captions import make_segment

MODEL_LOCK = threading.Lock()
WHISPER_MODEL_INSTANCE = None


def whisper_model_source(model_name):
    """Ưu tiên model đã bundle để desktop không tải mạng lúc chạy."""
    import os

    bundled_path = os.environ.get("WHISPER_MODEL_PATH", "").strip()
    return bundled_path or model_name


def run_command(args, should_cancel=None, deadline=None):
    process = None
    try:
        with TemporaryFile(mode="w+") as stdout_file, TemporaryFile(mode="w+") as stderr_file:
            process = subprocess.Popen(args, stdout=stdout_file, stderr=stderr_file, text=True)
            while process.poll() is None:
                if should_cancel and should_cancel():
                    process.kill()
                    process.wait()
                    raise JobCancelled()
                if deadline and time.time() >= deadline:
                    process.kill()
                    process.wait()
                    raise JobDeadlineExceeded()
                time.sleep(0.25)
            process.wait()
            stdout_file.seek(0)
            stderr_file.seek(0)
            stdout = stdout_file.read()
            stderr = stderr_file.read()
        if process.returncode:
            raise subprocess.CalledProcessError(process.returncode, args, stdout, stderr)
        return stdout
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or "").strip()
        print(f"[worker] command failed: {detail[-1200:]}", file=sys.stderr)
        if re.search(r"429|too many requests|rate.?limit", detail, re.IGNORECASE):
            raise WorkerError("UPSTREAM_RATE_LIMITED", "Nguồn video đang giới hạn request.") from error
        raise WorkerError("UPSTREAM_COMMAND_FAILED", "Không thể xử lý nguồn video.") from error


def get_whisper_model(model_name):
    global WHISPER_MODEL_INSTANCE
    with MODEL_LOCK:
        if WHISPER_MODEL_INSTANCE is None:
            import whisper
            WHISPER_MODEL_INSTANCE = whisper.load_model(whisper_model_source(model_name))
    return WHISPER_MODEL_INSTANCE


def _whisper_child(audio_path, language, model_name, result_queue):
    try:
        result_queue.put(get_whisper_model(model_name).transcribe(audio_path, language=language, fp16=False))
    except Exception as error:  # pragma: no cover - exercised through parent process
        result_queue.put({"__error__": str(error)})


def transcribe_with_cancel(audio_path, language, model_name, should_cancel=None, deadline=None):
    result_queue = Queue(maxsize=1)
    process = Process(target=_whisper_child, args=(audio_path, language, model_name, result_queue))
    process.start()
    try:
        while process.is_alive():
            if should_cancel and should_cancel():
                process.terminate()
                process.join(5)
                raise JobCancelled()
            if deadline and time.time() >= deadline:
                process.terminate()
                process.join(5)
                raise JobDeadlineExceeded()
            time.sleep(0.25)
        process.join()
        try:
            result = result_queue.get(timeout=10)
        except Empty as error:
            raise WorkerError("WHISPER_FAILED", "Whisper không trả về kết quả.") from error
        if "__error__" in result:
            raise WorkerError("WHISPER_FAILED", "Whisper không thể chuyển audio thành văn bản.")
        return result
    finally:
        if process.is_alive():
            process.terminate()
        process.join(5)
        result_queue.close()
        result_queue.join_thread()


def transcribe_audio(url, language, temp_dir, on_stage, ytdlp, ffmpeg, model_name, max_duration, should_cancel=None, deadline=None):
    audio_template = str(Path(temp_dir) / "audio.%(ext)s")
    run_command([
        ytdlp, "--no-playlist", "--no-warnings", "--retries", "3", "--fragment-retries", "3",
        "--match-filter", f"duration <= {max_duration}", "-f", "bestaudio/best", "-o", audio_template, url,
    ], should_cancel, deadline)
    audio_files = [path for path in Path(temp_dir).glob("audio.*") if path.suffix != ".wav"]
    if not audio_files:
        raise WorkerError("AUDIO_NOT_FOUND", "Không tìm thấy audio của video.")
    wav_path = Path(temp_dir) / "audio.wav"
    run_command([ffmpeg, "-y", "-i", str(audio_files[0]), "-ar", "16000", "-ac", "1", str(wav_path)], should_cancel, deadline)
    on_stage("transcribing")
    if should_cancel and should_cancel():
        raise JobCancelled()
    if deadline and __import__('time').time() >= deadline:
        raise JobDeadlineExceeded()
    result = transcribe_with_cancel(
        str(wav_path), None if language in (None, "", "auto") else language,
        model_name, should_cancel, deadline,
    )
    segments = []
    for segment in result.get("segments", []):
        start = float(segment.get("start", 0))
        end = float(segment.get("end", start))
        item = make_segment(segment.get("text", ""), start, end, result.get("language"))
        if item:
            segments.append(item)
    return segments, result.get("language")
