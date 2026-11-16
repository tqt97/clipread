# Triển khai ClipRead trên Vercel

## Cách nhanh

1. Đưa repository lên GitHub.
2. Chọn Add New Project trong Vercel.
3. Import repository và để Vercel tự nhận diện Next.js.
4. Dùng Node.js 22 trở lên.
5. Deploy.

Chi tiết CI/CD và cách chọn giữa Vercel Git Integration với GitHub Actions xem [docs/11-CI-CD-AND-DEPLOYMENT.md](docs/11-CI-CD-AND-DEPLOYMENT.md).

UI/API MVP không cần database. Nếu bật TikTok/Facebook hoặc Whisper, cần thêm `TRANSCRIPTION_WORKER_URL` và tùy chọn `TRANSCRIPTION_WORKER_TOKEN`; worker phải chạy ngoài request Vercel.

## Runtime hiện tại

`app/api/transcript/route.ts` dùng Node.js runtime và `maxDuration = 30`. YouTube caption chạy trực tiếp; job TikTok/Facebook và fallback Whisper được chuyển sang worker.

## Trước khi deploy

```bash
npm ci
npm run check
```

`package-lock.json` phải được commit để build lặp lại được.

## Giới hạn

- YouTube có thể giới hạn request hoặc đổi interface nội bộ.
- Video không có caption được chuyển sang Whisper nếu worker đang chạy.
- TikTok/Facebook cần worker local/remote đã xác thực.
- Worker dài, FFmpeg và Whisper phải chạy ngoài request Vercel.
- Worker có thể kiểm tra health bằng `GET /health`; endpoint không thay thế monitoring hoặc rate limit production.
