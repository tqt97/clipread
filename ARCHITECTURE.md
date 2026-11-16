# ClipRead — Kiến trúc nhanh

Tài liệu kiến trúc đầy đủ nằm tại [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md). Biên bản review source và baseline nằm tại [docs/10-SOURCE-REVIEW-AND-BASELINE.md](docs/10-SOURCE-REVIEW-AND-BASELINE.md).

```text
Browser
  ↓
TranscriptWorkbench
  ↓ POST /api/transcript
validate + detect platform
  ↓
provider registry → YouTubeTranscriptProvider
  ↓
TranscriptDocument
  ↓
bài đọc / Markdown / TXT / SRT
```

Các module có trách nhiệm rõ:

- `app/`: entry point Next.js và protocol HTTP.
- `components/`: UI và tương tác browser.
- `domain/`: contract, chuẩn hóa, projection và exporter thuần.
- `services/`: interface, registry và adapter provider.

Transcript gốc là source of truth. Không thêm database, worker, AI layer hoặc thư mục `utils` cho tới khi có nhu cầu và contract đủ rõ.
