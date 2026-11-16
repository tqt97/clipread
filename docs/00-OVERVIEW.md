# ClipRead — Tổng quan sản phẩm và kỹ thuật

> Biến video thành nội dung có thể đọc.

## 1. Mục tiêu

ClipRead là web app tập trung vào một nhiệm vụ duy nhất: **biến nội dung video thành nội dung có thể đọc và xuất ra file**. Tìm kiếm và derived knowledge đã có ở mức deterministic; transcript gốc vẫn là source of truth.

Mental model của sản phẩm:

```text
Paste URL
→ Lấy transcript/subtitle
→ Làm sạch nội dung
→ Đọc ngay trên web
→ Export Markdown / TXT / SRT
```

ClipRead **không phải** một downloader UI. Bounded context chính là:

```text
Video → Readable Knowledge
```

## 2. MVP hiện tại

### Đã có trong codebase

- YouTube public URL có caption/subtitle, với fallback worker khi thiếu caption.
- Pipeline thử nghiệm cho TikTok/Facebook/Reels public URL qua worker `yt-dlp` khi đã cấu hình; chưa có public URL regression matrix.
- Metadata: title, author, duration, thumbnail khi provider trả về được.
- Chế độ bài đọc dễ đọc.
- Chế độ caption giữ timestamp.
- Tìm kiếm, highlight và cụm từ khóa deterministic.
- Summary trích xuất ngắn, action items, grounded Q&A, bookmark và notes local.
- Copy transcript.
- Export Markdown.
- Export TXT.
- Export SRT.
- Chọn ưu tiên ngôn ngữ: tiếng Việt / tiếng Anh / tiếng Nhật.
- Không cần account.
- Không cần database.
- Không cần API key speech-to-text khi chạy worker local.
- Deploy được trên Vercel.

### Phụ thuộc worker local

- TikTok.
- Facebook / Reels.

Nếu chưa bật worker, hệ thống trả `PROVIDER_NOT_READY`; khi worker đã bật, hai platform này đi qua job bất đồng bộ.

### Chưa nằm trong MVP

- Whisper / speech-to-text fallback trực tiếp trong Vercel route.
- Audio download trực tiếp trong Vercel route.
- Abstractive AI summary và semantic search bằng embedding.
- Saved library/history.
- Authentication.
- Queue bền vững nhiều worker.

## 3. Nguyên tắc sản phẩm

1. Subtitle-first: dùng caption sẵn có trước khi nghĩ đến speech-to-text.
2. Transcript là source of truth.
3. AI output về sau phải tách biệt khỏi transcript gốc.
4. Không quảng cáo platform là supported trước khi có test matrix lặp lại được.
5. Không đưa long-running transcription vào request ngắn của Vercel.
6. Ưu tiên trải nghiệm đọc hơn số lượng feature.

## 4. Stack

```text
Next.js App Router
TypeScript
React
Node.js runtime
Vercel
YouTube transcript provider
Worker Python: yt-dlp + FFmpeg + Whisper local
```

## 5. Tiêu chí hoàn thành MVP

MVP đạt yêu cầu khi user có thể:

1. Paste một YouTube URL public có caption.
2. Nhận transcript trong một request bình thường.
3. Chuyển giữa chế độ bài đọc và caption.
4. Copy hoặc tải xuống `.md`, `.txt`, `.srt`.
5. Nhận lỗi rõ ràng nếu video không có caption hoặc provider chưa hỗ trợ.

## 6. Hướng phát triển

```text
v0.1 Transcript extraction
   ↓
v0.2 Reading experience
   ↓
v0.3 Knowledge layer
   ↓
v0.4 Speech-to-text fallback
   ↓
v0.5 More providers
   ↓
Later Library / Search / Save
```
