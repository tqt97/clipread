# ClipRead — Lộ trình

## v0.1 — MVP ưu tiên phụ đề

- YouTube public có caption.
- Metadata, bài đọc, caption kèm timestamp.
- Copy và xuất Markdown/TXT/SRT.
- Triển khai được trên Vercel không cần database.

## v0.2 — Đọc tốt hơn

- Tìm kiếm và highlight trong transcript.
- Timestamp mở video đúng vị trí.
- Lấy danh sách caption language thực tế.
- Phân đoạn bài đọc tốt hơn và lưu tiến độ đọc.

## v0.3 — Hiểu nhanh hơn

- Summary, key ideas, chapters, action items và translation.
- Mọi kết quả AI phải là derived artifact, không ghi đè transcript gốc.

## v0.4 — Fallback không có caption

- Job nền, lấy audio tạm, FFmpeg, Whisper/STT.
- Retry, cancellation, cleanup và giới hạn tài nguyên.

## v0.5 — Thêm nguồn

Nghiên cứu TikTok và Facebook/Reels; chỉ công bố hỗ trợ sau khi pass test matrix lặp lại được.

## Về sau — Thư viện cá nhân

Save transcript, tag, tìm kiếm toàn văn, read later và tài khoản tùy chọn. Chỉ thêm persistence khi extraction đã chứng minh có giá trị.
