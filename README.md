# ClipRead

> Biến video thành nội dung có thể đọc.

ClipRead là web app ưu tiên caption: người dùng dán đường dẫn video, hệ thống lấy caption khả dụng, làm sạch thành các đoạn dễ đọc rồi cho phép xuất Markdown, văn bản thuần hoặc SRT.

## Phạm vi MVP

Đã có: URL YouTube công khai có caption, metadata, chế độ bài đọc, chế độ caption kèm timestamp, tìm kiếm chính xác hoặc gợi ý liên quan local, cụm từ khóa, summary trích xuất ngắn, action items, Q&A grounded, bookmark/notes local, đọc gần đây có giới hạn quota, import/export workspace có schema validation, share link tự tải, copy, xuất `.md`/`.txt`/`.srt` và export knowledge `.md`. UI transcript dài dùng virtualized rendering.

TikTok và Facebook có pipeline thử nghiệm qua worker local khi `TRANSCRIPTION_WORKER_URL` đã cấu hình. Vì chưa có public URL regression matrix, chưa xem đây là production guarantee. Nếu chưa bật worker, API trả `PROVIDER_NOT_READY`.

Chưa có: semantic search bằng embedding/model ngôn ngữ, abstractive summary, tài khoản và thư viện đồng bộ cloud. Gợi ý theo nội dung hiện dùng TF-IDF local, không hiểu synonym như embedding model. Summary/Q&A chỉ dùng transcript làm nguồn, không gọi API AI trả phí. Tải audio và speech-to-text chỉ chạy trong worker local, không chạy trực tiếp trong route Vercel.

## Cấu trúc chính

```text
Browser → Next.js UI → POST /api/transcript
                    → chọn TranscriptProvider
                    → YouTubeTranscriptProvider
                    → TranscriptDocument
                    → bài đọc / Markdown / TXT / SRT

TikTok/Facebook hoặc YouTube không có caption
        → POST /jobs → worker/server.py
        → captions.py → transcriber.py (yt-dlp + FFmpeg + Whisper)
        → polling trạng thái → TranscriptDocument
```

Seam `TranscriptProvider` giúp bổ sung provider sau này mà không làm UI phụ thuộc vào shape riêng của YouTube.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Bật hỗ trợ TikTok/Facebook và video không có caption

Worker local nằm tại [worker/README.md](worker/README.md). Worker dùng `yt-dlp` để lấy caption từ YouTube/TikTok/Facebook và Whisper local làm fallback khi không có caption. Không cần API key speech-to-text.

```bash
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
python3 -m worker.server
```

Ở terminal chạy Next.js. TikTok/Facebook dùng pipeline worker thử nghiệm; YouTube chỉ dùng worker khi không có caption:

```bash
export TRANSCRIPTION_WORKER_URL=http://127.0.0.1:8787
npm run dev
```

Khi deploy tại `https://clipread-five.vercel.app/`, không dùng URL local ở trên. Xem [hướng dẫn cấu hình Vercel và worker](docs/11-CI-CD-AND-DEPLOYMENT.md#0-trường-hợp-của-project-clipread-five).

## Kiểm tra

```bash
npm run check
```

`npm run check` chạy typecheck, lint, format check, domain tests, worker tests và production build.

`npm run benchmark:transcript` đo lexical search trên 1k/5k/20k segments để kiểm tra regression hiệu năng trước khi thay bằng embedding model.

`npm run evaluate:search` chạy bộ fixture nhỏ để đo recall minh bạch của lexical và TF-IDF ranking. Đây chưa phải benchmark accuracy production; muốn bật embedding model phải bổ sung tập đánh giá transcript thật đã ẩn dữ liệu nhạy cảm.

Smoke public URL (chỉ chạy khi tự cấu hình URL test public):

```bash
CLIPREAD_BASE_URL=https://clipread-five.vercel.app \
SMOKE_YOUTUBE_URL='https://...' \
SMOKE_TIKTOK_URL='https://...' \
npx tsx scripts/smoke-public-urls.ts
```

`npm run test:e2e` chạy Playwright trên production build local, dùng API fixture để kiểm tra flow UI mà không phụ thuộc YouTube/TikTok/Facebook.

## Triển khai

Vercel tự nhận diện Next.js. Node.js tối thiểu là 22; YouTube caption-only không cần database hoặc environment variable. Nếu bật worker, cần cấu hình `TRANSCRIPTION_WORKER_URL` và `TRANSCRIPTION_WORKER_TOKEN` trên Vercel. Route transcript chạy Node.js runtime với giới hạn 30 giây.

Xem hướng dẫn CI/CD và deploy đầy đủ tại [docs/11-CI-CD-AND-DEPLOYMENT.md](docs/11-CI-CD-AND-DEPLOYMENT.md).

## Lỗi thường gặp

- `Không kết nối được`: kiểm tra mạng, URL deployment và thử lại.
- `Worker đang không khả dụng`: kiểm tra `TRANSCRIPTION_WORKER_URL` và worker process.
- `Worker chưa được xác thực`: đối chiếu `TRANSCRIPTION_WORKER_TOKEN` ở Vercel với `WORKER_AUTH_TOKEN` ở worker.
- `YouTube đang giới hạn truy cập`: dùng remote worker hoặc chờ rồi thử lại.
- `Không tìm thấy transcript`: bật worker để fallback Whisper cho video không có caption.

## Giới hạn cần biết

Việc lấy transcript YouTube phụ thuộc vào interface không chính thức thông qua `youtube-transcript-plus`. YouTube thay đổi upstream hoặc giới hạn request có thể làm việc trích xuất thất bại; API trả lỗi có mã thay vì giả vờ thành công.

## Tài liệu

Xem [docs/README.md](docs/README.md) để đọc bản tổng quan, kiến trúc, pipeline, API contract, bảo mật, kiểm thử, triển khai, kế hoạch và baseline review.
