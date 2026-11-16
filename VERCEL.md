# Triển khai ClipRead trên Vercel

## Cách nhanh

1. Đưa repository lên GitHub.
2. Chọn Add New Project trong Vercel.
3. Import repository và để Vercel tự nhận diện Next.js.
4. Dùng Node.js 22 trở lên.
5. Deploy.

MVP không cần biến môi trường hay database.

## Runtime hiện tại

`app/api/transcript/route.ts` dùng Node.js runtime và `maxDuration = 30`. MVP chỉ lấy caption có sẵn; không tải audio và không chạy Whisper.

## Trước khi deploy

```bash
npm ci
npm run check
```

`package-lock.json` phải được commit để build lặp lại được.

## Giới hạn

- YouTube có thể giới hạn request hoặc đổi interface nội bộ.
- Video không có caption trả lỗi rõ ràng.
- TikTok/Facebook được nhận diện nhưng chưa có extraction provider.
- Worker dài, FFmpeg và Whisper phải chạy ngoài request Vercel.
