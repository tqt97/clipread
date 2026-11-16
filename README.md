# ClipRead

> Biến video thành nội dung có thể đọc.

ClipRead là web app ưu tiên caption: người dùng dán đường dẫn video, hệ thống lấy caption khả dụng, làm sạch thành các đoạn dễ đọc rồi cho phép xuất Markdown, văn bản thuần hoặc SRT.

## Phạm vi MVP

Đã có: URL YouTube công khai có caption, metadata, chế độ bài đọc, chế độ caption kèm timestamp, copy, xuất `.md`/`.txt`/`.srt`, lựa chọn ngôn ngữ Việt/Anh/Nhật. MVP không có tài khoản, cơ sở dữ liệu hay lưu trữ lâu dài.

TikTok và Facebook mới chỉ được nhận diện; API trả `PROVIDER_NOT_READY` cho tới khi có provider ổn định.

Chưa có: tải audio, speech-to-text, tóm tắt AI, thư viện lưu trữ và authentication.

## Cấu trúc chính

```text
Browser → Next.js UI → POST /api/transcript
                    → chọn TranscriptProvider
                    → YouTubeTranscriptProvider
                    → TranscriptDocument
                    → bài đọc / Markdown / TXT / SRT
```

Seam `TranscriptProvider` giúp bổ sung provider sau này mà không làm UI phụ thuộc vào shape riêng của YouTube.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Kiểm tra

```bash
npm run typecheck
npm run build
```

## Triển khai

Vercel tự nhận diện Next.js. Node.js tối thiểu là 22; MVP không cần biến môi trường hay cơ sở dữ liệu. Route transcript chạy Node.js runtime với giới hạn 30 giây.

## Giới hạn cần biết

Việc lấy transcript YouTube phụ thuộc vào interface không chính thức thông qua `youtube-transcript-plus`. YouTube thay đổi upstream hoặc giới hạn request có thể làm việc trích xuất thất bại; API trả lỗi có mã thay vì giả vờ thành công.

## Tài liệu

Xem [docs/README.md](docs/README.md) để đọc bản tổng quan, kiến trúc, pipeline, API contract, bảo mật, kiểm thử, triển khai, kế hoạch và baseline review.
