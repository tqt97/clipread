import re
import subprocess
import sys
import threading
from pathlib import Path

from .errors import WorkerError
from .captions import make_segment

MODEL_LOCK = threading.Lock()
WHISPER_MODEL_INSTANCE = None


def run_command(args):
    try:
        completed = subprocess.run(args, check=True, capture_output=True, text=True, timeout=900)
        return completed.stdout
    except subprocess.TimeoutExpired as error:
        raise WorkerError("COMMAND_TIMEOUT", "Nguồn video xử lý quá lâu.") from error
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
            WHISPER_MODEL_INSTANCE = whisper.load_model(model_name)
    return WHISPER_MODEL_INSTANCE


def transcribe_audio(url, language, temp_dir, on_stage, ytdlp, ffmpeg, model_name, max_duration):
    audio_template = str(Path(temp_dir) / "audio.%(ext)s")
    run_command([
        ytdlp, "--no-playlist", "--no-warnings", "--retries", "3", "--fragment-retries", "3",
        "--match-filter", f"duration <= {max_duration}", "-f", "bestaudio/best", "-o", audio_template, url,
    ])
    audio_files = [path for path in Path(temp_dir).glob("audio.*") if path.suffix != ".wav"]
    if not audio_files:
        raise WorkerError("AUDIO_NOT_FOUND", "Không tìm thấy audio của video.")
    wav_path = Path(temp_dir) / "audio.wav"
    run_command([ffmpeg, "-y", "-i", str(audio_files[0]), "-ar", "16000", "-ac", "1", str(wav_path)])
    on_stage("transcribing")
    result = get_whisper_model(model_name).transcribe(
        str(wav_path),
        language=None if language in (None, "", "auto") else language,
        fp16=False,
    )
    segments = []
    for segment in result.get("segments", []):
        start = float(segment.get("start", 0))
        end = float(segment.get("end", start))
        item = make_segment(segment.get("text", ""), start, end, result.get("language"))
        if item:
            segments.append(item)
    return segments, result.get("language")
