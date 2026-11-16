# ClipRead — Triển khai trên Vercel

## 1. Scope phù hợp với Vercel

MVP subtitle-first phù hợp vì request chỉ lấy caption và metadata, không download media lớn và không chạy model local.

## 2. Runtime hiện tại

API route sử dụng Node.js runtime.

```ts
export const runtime = 'nodejs';
export const maxDuration = 30;
```

## 3. Deploy

```text
GitHub repository
→ Vercel Add New Project
→ Import repository
→ Next.js auto-detect
→ Deploy
```

MVP không cần database hoặc environment variable.

## 4. Before deploy

```bash
npm install
npm run typecheck
npm run build
```

Sau lần install đầu tiên:

- commit `package-lock.json`;
- dùng `npm ci` trong CI;
- không để dependency version trôi không kiểm soát.

## 5. Production checklist

- custom domain;
- error monitoring;
- basic analytics;
- rate limiting;
- request logging tối thiểu;
- security headers;
- health/status visibility;
- upstream failure dashboard nếu usage tăng.

## 6. Không đưa vào Vercel request path

Không nên chạy trực tiếp trong request thông thường:

- yt-dlp download file dài;
- FFmpeg transcoding;
- Whisper local inference;
- multi-minute job;
- job cần cancellation/retry phức tạp.

Các tác vụ này chuyển sang worker/job architecture.
