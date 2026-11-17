# ClipRead — Checklist trước release

## Code quality

- [ ] `npm run typecheck` pass.
- [ ] `npm run test:domain` pass.
- [ ] `npm run build` pass.
- [ ] `npm run test:worker` pass.
- [ ] `npm run test:provider` pass.
- [ ] `npm run test:e2e` pass trên production build local.
- [ ] `npm run benchmark:transcript` không có regression bất thường.
- [ ] không còn debug logs không cần thiết.
- [ ] error messages user-facing rõ ràng.

## Provider verification

- [ ] YouTube public caption test pass.
- [ ] no-caption case chạy Whisper khi worker bật hoặc trả lỗi rõ ràng khi worker tắt.
- [ ] invalid URL case pass.
- [ ] TikTok/Facebook có worker pass test URL public.
- [ ] Không có worker thì vẫn trả `PROVIDER_NOT_READY` rõ ràng.

## Export verification

- [ ] Markdown UTF-8 đúng.
- [ ] TXT UTF-8 đúng.
- [ ] SRT timestamp hợp lệ.
- [ ] Vietnamese/Japanese text không lỗi encoding.

## Security

- [ ] URL validation.
- [ ] không generic server-side fetch tùy ý.
- [ ] transcript render không dùng unsafe HTML.
- [ ] logs không chứa dữ liệu không cần thiết.
- [ ] Worker remote có `WORKER_AUTH_TOKEN`.
- [ ] Worker có giới hạn duration, queue và TTL job.
- [ ] Worker có deadline, heartbeat/stale recovery và cancel endpoint.
- [ ] Lỗi upstream 429 không retry mù.
- [ ] SQLite backup đã tạo và kiểm tra file tồn tại.

## Deployment

- [ ] GitHub Actions CI pass trên commit release.
- [ ] Vercel build pass.
- [ ] Chọn đúng một cơ chế production deploy: Vercel Git Integration hoặc GitHub Actions.
- [ ] production URL smoke test.
- [ ] error monitoring hoạt động.
- [ ] changelog cập nhật.
- [ ] version/tag đồng bộ.
