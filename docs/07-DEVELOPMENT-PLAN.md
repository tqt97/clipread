# ClipRead — Kế hoạch phát triển theo milestone

## Nguyên tắc ưu tiên

Ưu tiên theo thứ tự:

```text
Core extraction correctness
→ Reading UX
→ Reliability
→ Knowledge transformation
→ No-caption fallback
→ More providers
→ Persistence
```

Không ưu tiên AI trước khi transcript extraction ổn định.

---

## Milestone 0 — Foundation

### Mục tiêu

Chuẩn hóa project để phát triển lâu dài.

### Tasks

- [x] Có `package-lock.json` để build lặp lại được.
- [x] Bật strict TypeScript.
- [x] Có typed API error.
- [x] Platform detection nằm ở domain, không nằm trong API route.
- [x] Export logic nằm ở domain, UI chỉ gọi hàm export.
- [ ] Thêm lint/format scripts.
- [ ] Thiết lập CI: typecheck + test + build.
- [ ] Thêm `CHANGELOG.md` khi bắt đầu release có version.

### Exit criteria

- build reproducible;
- domain contract rõ;
- API route không chứa business logic dài.

---

## v0.1 — Subtitle-first MVP

### Mục tiêu

Chứng minh user có thể biến video có caption thành bài đọc nhanh.

### Scope

- [x] Paste URL.
- [x] Detect YouTube/TikTok/Facebook.
- [x] YouTube transcript provider.
- [x] Metadata.
- [x] Readable mode.
- [x] Caption/timestamp mode.
- [x] Copy.
- [x] Markdown/TXT/SRT.
- [x] Vercel-ready.

### Cần hoàn thiện trước public beta

- [ ] Unit test URL detection.
- [ ] Unit test exporters.
- [ ] Unit test paragraph grouping.
- [ ] Provider integration test matrix.
- [x] Friendly error UX và mã lỗi ổn định cho các nhánh hiện tại.
- [ ] Rate-limit guard cơ bản.

---

## v0.2 — Reading Experience

### Mục tiêu

Biến transcript từ “text dump” thành trải nghiệm đọc có giá trị.

### P0

- [ ] Search trong transcript.
- [ ] Highlight kết quả.
- [ ] Click timestamp mở video đúng vị trí.
- [ ] Discover caption languages thực tế.
- [ ] Better paragraph segmentation.

### P1

- [ ] Reading progress.
- [ ] Font size controls.
- [ ] Focus/reader mode.
- [ ] Copy selected paragraph.
- [ ] Keyboard shortcuts.

### Exit criteria

User có thể dùng ClipRead để đọc video dài mà không cần mở video liên tục.

---

## v0.3 — Knowledge Layer

### Mục tiêu

Giúp user tiêu thụ nội dung nhanh hơn transcript nguyên văn.

### Features

- [ ] Summary.
- [ ] Key ideas.
- [ ] Chapters.
- [ ] Action items.
- [ ] Translation.

### Architecture rule

```text
Original Transcript
        ↓
Derived AI Artifacts
```

AI output không thay thế transcript gốc.

### Cost controls

- [ ] token estimation;
- [ ] max transcript length;
- [ ] chunking strategy;
- [ ] model abstraction;
- [ ] user-triggered processing, không auto-call AI.

---

## v0.4 — No-caption Fallback

### Mục tiêu

Video không có caption vẫn có thể chuyển thành text.

### Architecture

```text
Web
→ create job
→ queue
→ worker
→ fetch audio
→ FFmpeg normalize
→ STT
→ TranscriptDocument
→ result
```

### Tasks

- [ ] Job model.
- [ ] Queue.
- [ ] Worker deployment.
- [ ] Audio temp storage.
- [ ] FFmpeg preprocessing.
- [ ] Whisper hoặc external STT provider.
- [ ] Polling/SSE job status.
- [ ] Cancellation.
- [ ] Retry policy.
- [ ] Cleanup.
- [ ] Resource/cost limits.

### Exit criteria

Job failure không làm mất kiểm soát temp file hoặc tài nguyên.

---

## v0.5 — More Providers

### TikTok

- [ ] Research extraction paths.
- [ ] Test public URL matrix.
- [ ] Confirm caption availability behavior.
- [ ] Implement adapter.
- [ ] Add regression fixtures.

### Facebook/Reels

- [ ] Research extraction paths.
- [ ] Public URL test matrix.
- [ ] Implement adapter nếu ổn định.

### Release rule

Chỉ hiển thị “Supported” sau khi provider pass repeatable tests.

---

## v0.6+ — Library / Read Later

Chỉ triển khai khi user thực sự có nhu cầu quay lại transcript.

Potential scope:

- [ ] Supabase.
- [ ] Authentication.
- [ ] Saved transcripts.
- [ ] Tags.
- [ ] Full-text search.
- [ ] Favorites.
- [ ] Read/unread.
- [ ] Import/export library.

Không thêm database chỉ để “app trông đầy đủ hơn”.
