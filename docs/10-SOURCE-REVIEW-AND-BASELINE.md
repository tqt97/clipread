# ClipRead — Biên bản review source và baseline

Ngày rà soát: 16/11/2026

## Phạm vi

Đã đọc toàn bộ source application, domain, provider, cấu hình, package manifest và toàn bộ tài liệu Markdown trong repository. Review này là kiểm tra tĩnh; chưa gọi API YouTube thật, chưa chạy browser E2E và chưa kiểm tra Vercel production.

## Kết luận ngắn

Nền tảng hiện đủ nhỏ để tiếp tục phát triển, nhưng trước đây tài liệu và implementation chưa cùng một contract. Baseline sau khi chỉnh là:

```text
UI → POST /api/transcript → validate + detect platform
  → chọn provider từ registry → TranscriptDocument
  → projection bài đọc hoặc exporter
```

## Những điểm đã xác nhận

| Khu vực | Bằng chứng | Kết luận |
|---|---|---|
| Entry point | `app/page.tsx` | Trang chính chỉ render `TranscriptWorkbench` |
| API | `app/api/transcript/route.ts`, `app/api/transcript/jobs/[jobId]/route.ts` | `POST /api/transcript` và `GET /api/transcript/jobs/{jobId}`, Node.js runtime, timeout route tạo job 30 giây |
| Domain | `domain/transcript.ts` | `TranscriptDocument` là contract chung; segment dùng `offset` và `duration` theo giây |
| Provider | `services/transcript-provider.ts`, `services/transcript-providers.ts` | Provider trực tiếp hiện đăng ký YouTube; TikTok/Facebook đi qua worker khi bật |
| Adapter | `services/youtube-transcript-provider.ts` | Adapter gọi `youtube-transcript-plus`, lấy metadata và caption |
| UI | `components/TranscriptWorkbench.tsx` | UI giữ state request/result/error và gọi exporter domain |
| Lưu trữ | `app/api/transcript/route.ts` | Không có DB, account, media storage hay server-side persistence |

## Đã làm sạch trong baseline

- Tách kiểu lỗi API ổn định tại `domain/api.ts`.
- Route phân biệt JSON hỏng, URL hỏng, platform chưa hỗ trợ, provider chưa sẵn sàng, không có transcript và lỗi upstream.
- Thêm kiểm tra chỉ nhận `http:`/`https:` trước khi detect platform.
- Sửa nhận diện hostname để không coi `evil-youtube.com` là YouTube.
- Tách việc chọn provider vào `services/transcript-providers.ts`.
- Đồng bộ tài liệu với shape thật: `offset`/`duration`, response lỗi `{ error, code }`.
- Việt hóa tài liệu và các nhãn UI hướng người dùng.

## Kiến trúc thư mục hiện tại

```text
app/                         route và giao diện Next.js
  api/transcript/            HTTP entry point
components/                  React client UI
domain/                      contract, projection, exporter, API error
services/                    provider interface và adapter cụ thể
worker/                      runtime Python: job, caption parser, yt-dlp/FFmpeg/Whisper
docs/                        tài liệu source-of-truth cho team
```

Chưa tách `lib/`, `utils/` hoặc database. Worker đã là một module riêng vì có runtime, dependency và lifecycle khác với Next.js.

## Rủi ro còn lại

- Worker parser/job-store/transcriber đã có automated test; browser E2E có fixture cho cancel, share link, accessibility và transcript dài. Public URL matrix vẫn cần chạy riêng.
- Worker hiện là MVP local/remote có token, SQLite job state, attempt persistence, lease fencing, cancel recovery, rate limit submit, một job mỗi lần và TTL cleanup.
- Error mapping vẫn dựa một phần vào message từ thư viện upstream/worker; nên chuyển sang error type riêng khi provider có thể phân biệt nguyên nhân ổn định.
- API có rate limit best-effort theo instance; worker có metrics counter/timing tối thiểu. Vẫn phù hợp MVP cá nhân, chưa đủ cho public multi-instance scale.
- `maxDuration = 30` là cấu hình source, chưa phải bằng chứng deployment thực tế đã nhận đúng cấu hình.
- Chưa kiểm chứng byte output, caption track thực tế, rate limit YouTube hoặc hành vi production.
- YouTube provider dùng cache in-memory theo warm instance và không retry mù khi `429`; Vercel vẫn có thể bị giới hạn theo IP datacenter, khi đó cần worker remote.
- Chưa cài dependency worker hoặc chạy transcript thật trong môi trường này.

## Thứ tự phát triển được khuyến nghị

1. Viết test domain và API contract trước khi thêm feature.
2. Tách request validation và error mapping thành module thuần để test không cần Next.js.
3. Hoàn thiện language discovery dựa trên caption track thật.
4. Thêm search/highlight và deep-link timestamp trên cùng `TranscriptDocument`.
5. Tiếp tục kiểm chứng extraction và worker bằng fixture URL ổn định trước khi thêm AI hoặc persistence.

## Quy tắc giữ kiến trúc

- Transcript gốc là source of truth; bài đọc, summary và translation đều là projection/derived artifact.
- UI không gọi provider trực tiếp.
- Provider không quyết định format hiển thị.
- Không thêm database chỉ để làm app có vẻ đầy đủ.
- Mọi thay đổi contract phải cập nhật code, test và tài liệu cùng một lần.
