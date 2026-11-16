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

- Extractive summary grounded bằng timestamp.
- Chapters deterministic theo khoảng ngắt và nhóm caption.
- Action items heuristic, luôn trỏ về đoạn nguồn.
- Bookmark và notes lưu local trên thiết bị.
- Export summary, chapters, action items và highlights.

## v0.4 — Local Understanding (đã có bản deterministic MVP)

- Q&A grounded: trả về các đoạn transcript liên quan, không bịa câu trả lời.
- Search hiện tại là lexical/accent-insensitive; semantic search thật cần embedding model local và sẽ triển khai sau khi có benchmark.

## v0.5 — Transcribe Anything (đã có bản local MVP)

- Background jobs in-memory.
- Audio extraction local.
- FFmpeg preprocessing.
- Whisper local fallback.
- Retry, dừng polling, cleanup và giới hạn tài nguyên.

## v0.6 — More Sources (experimental)

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
