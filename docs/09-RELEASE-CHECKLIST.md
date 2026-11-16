# ClipRead — Checklist trước release

## Code quality

- [ ] `npm run typecheck` pass.
- [ ] `npm run build` pass.
- [ ] tests pass khi test runner đã được thêm.
- [ ] không còn debug logs không cần thiết.
- [ ] error messages user-facing rõ ràng.

## Provider verification

- [ ] YouTube public caption test pass.
- [ ] no-caption case trả đúng error.
- [ ] invalid URL case pass.
- [ ] TikTok/Facebook vẫn báo provider not ready nếu chưa support thật.

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

## Deployment

- [ ] Vercel build pass.
- [ ] production URL smoke test.
- [ ] error monitoring hoạt động.
- [ ] changelog cập nhật.
- [ ] version/tag đồng bộ.
