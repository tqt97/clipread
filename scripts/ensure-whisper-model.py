"""Tải và materialize Whisper model vào đúng vị trí desktop bundle."""

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "desktop" / "bundle" / "runtime" / "models" / "base.pt"


def main():
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists() and TARGET.stat().st_size >= 1_000_000:
        print(f"Whisper model đã sẵn sàng: {TARGET}")
        return

    try:
        import whisper
    except ImportError as error:
        raise SystemExit(
            "Thiếu openai-whisper. Chạy `python -m pip install -r worker/requirements.txt` "
            "trước khi chuẩn bị desktop bundle."
        ) from error

    whisper.load_model("base", download_root=str(TARGET.parent))
    cache_candidates = [
        TARGET,
        Path.home() / ".cache" / "whisper" / "base.pt",
    ]
    for source in cache_candidates:
        if source.exists() and source.stat().st_size >= 1_000_000:
            if source != TARGET:
                shutil.copy2(source, TARGET)
            print(f"Whisper model đã sẵn sàng: {TARGET}")
            return
    raise SystemExit("Whisper không tạo được desktop/bundle/runtime/models/base.pt")


if __name__ == "__main__":
    main()
