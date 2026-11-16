# ClipRead — Lộ trình phát triển

## v0.1 — Subtitle-first MVP

- YouTube public captions.
- Metadata.
- Readable mode.
- Caption + timestamp mode.
- Markdown/TXT/SRT export.
- Copy transcript.
- Vercel deployment.

## v0.2 — Read Better

- Transcript search.
- Deterministic keywords và highlights có timestamp.
- Timestamp deep-link.
- Real caption language discovery.
- Better paragraph segmentation.
- Reading progress.

## v0.3 — Understand Faster

- Summary.
- Key ideas.
- Chapters.
- Action items.
- Translation.

## v0.4 — Transcribe Anything (đã có bản local MVP)

- Background jobs in-memory.
- Audio extraction local.
- FFmpeg preprocessing.
- Whisper local fallback.
- Retry, dừng polling, cleanup và giới hạn tài nguyên.

## v0.5 — More Sources (experimental)

- TikTok qua worker `yt-dlp`, cần test matrix public URL.
- Facebook/Reels qua worker `yt-dlp`, cần test matrix public URL.

## Later — Personal Knowledge Library

- Save transcript.
- Tags.
- Full-text search.
- Read later.
- Optional account.

## Product north star

Không tối ưu cho “nhiều chức năng nhất”.

Tối ưu cho:

```text
Video 20 phút
→ nội dung có thể đọc trong vài phút
→ vẫn giữ đường quay lại nguồn gốc
```
