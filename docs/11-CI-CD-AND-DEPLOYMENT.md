# ClipRead — CI/CD và triển khai đầy đủ

Tài liệu này mô tả đường đi từ commit đến production, gồm Next.js trên Vercel và worker Python chạy ngoài Vercel.

Project production hiện tại: [https://clipread-five.vercel.app/](https://clipread-five.vercel.app/).

## 0. Trường hợp của project `clipread-five`

Nếu giao diện nhận diện TikTok nhưng báo `provider transcript chưa được bật trong MVP`, Vercel chưa có biến `TRANSCRIPTION_WORKER_URL` trong environment đang deploy. Nếu YouTube local chạy nhưng Vercel lỗi, Vercel có thể đang bị YouTube giới hạn theo IP máy chủ. Hai vấn đề đều được xử lý bằng cách cấu hình worker remote.

### Environment variables bắt buộc trên Vercel

Vào `Vercel → clipread-five → Settings → Environment Variables`, thêm chính xác:

```text
TRANSCRIPTION_WORKER_URL=https://<worker-domain>
TRANSCRIPTION_WORKER_TOKEN=<random-secret>
```

Chọn `Production`. Nếu muốn test Preview Deployment, thêm cùng biến cho `Preview`.

Worker phải có:

```text
WORKER_AUTH_TOKEN=<cùng random-secret>
```

`TRANSCRIPTION_WORKER_URL` không được là `localhost`, `127.0.0.1` hoặc URL HTTP không public. Sau khi lưu environment variables, chọn `Redeploy` deployment production; Vercel không tự áp dụng biến mới cho deployment cũ.

## 1. Kiến trúc deploy

```text
Pull request / push
        ↓
GitHub Actions CI
  npm ci → lint → format check → domain/worker tests → Next build → Playwright E2E
        ↓ pass
main
        ↓
Vercel Production Deployment
        ↓
Next.js API ──HTTPS + token──> Python worker
                              yt-dlp + FFmpeg + Whisper
```

Vercel không chạy worker local. `127.0.0.1` trong Vercel chỉ trỏ tới container Vercel, không phải máy đang chạy worker.

## 2. CI GitHub Actions

Workflow: `.github/workflows/ci.yml`.

CI chạy khi:

- push lên `main`;
- mở hoặc cập nhật Pull Request vào `main`.

CI dùng Node.js 22, Python 3.12 và `npm ci`, sau đó chạy:

```bash
npm run check
```

`npm run check` gồm:

1. `npm run typecheck`;
2. `npm run lint`;
3. `npm run format:check`;
4. `npm run test:domain`;
5. `npm run test:worker`;
6. `npm run build`.

Sau `npm run check`, CI cài Chromium bằng Playwright và chạy `E2E_SKIP_BUILD=1 npm run test:e2e` trên production server local, dùng build đã được kiểm tra. E2E dùng API fixture, không gọi URL video public thật.

Không cài `worker/requirements.txt` trong CI mặc định vì test worker hiện là parser/job-store test và không cần tải Whisper model nặng. Khi thêm integration test gọi `yt-dlp`/Whisper, tạo workflow riêng có fixture và timeout rõ ràng.

## 3. Cách khuyến nghị: Vercel Git Integration

Đây là cách ít vận hành nhất:

1. Push repository lên GitHub.
2. Vercel → `Add New Project` → import repository.
3. Chọn production branch là `main`.
4. Vercel tự tạo Preview Deployment cho branch/PR và Production Deployment khi `main` được deploy.
5. Trong Vercel, bật Deployment Checks hoặc yêu cầu GitHub check `CI / Quality, tests, build, E2E` pass trước khi merge.

Nếu dùng cách này, không bật thêm workflow deploy production bên dưới để tránh một commit tạo hai production deployment.

## 4. Cách dùng GitHub Actions để deploy Vercel

Repository đã có workflow `.github/workflows/deploy-vercel.yml`. Workflow chỉ chạy thật khi repository variable sau được bật:

```text
VERCEL_DEPLOY_ENABLED=true
```

### 4.1. Lấy thông tin Vercel

Cài Vercel CLI và link project một lần trên máy local:

```bash
npm install --global vercel
vercel login
vercel link
```

Sau `vercel link`, đọc `.vercel/project.json` để lấy:

- `orgId` → `VERCEL_ORG_ID`;
- `projectId` → `VERCEL_PROJECT_ID`.

Không commit thư mục `.vercel/` hoặc token.

### 4.2. Tạo GitHub secrets

Repository → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`:

| Secret              | Giá trị                               |
| ------------------- | ------------------------------------- |
| `VERCEL_TOKEN`      | Vercel personal token hoặc team token |
| `VERCEL_ORG_ID`     | `orgId` từ `.vercel/project.json`     |
| `VERCEL_PROJECT_ID` | `projectId` từ `.vercel/project.json` |

Tạo repository variable tại tab `Variables`:

```text
VERCEL_DEPLOY_ENABLED=true
```

Workflow sẽ `pull` project settings, build artifact và deploy artifact bằng Vercel CLI. Không ghi token vào file hoặc log.

### 4.3. GitHub Environment

Tạo environment tên `production` và bật protection rule nếu cần:

- required reviewers cho production;
- branch restriction chỉ cho `main`;
- deployment history để rollback.

Với project cá nhân, có thể không yêu cầu reviewer; với production có người dùng thật nên bật ít nhất branch restriction.

## 5. Environment variables trên Vercel

Trong Vercel → Project → `Settings` → `Environment Variables`:

### Chỉ YouTube caption

Không bắt buộc environment variable.

### Bật worker

```text
TRANSCRIPTION_WORKER_URL=https://worker.example.com
TRANSCRIPTION_WORKER_TOKEN=<cùng giá trị WORKER_AUTH_TOKEN>
```

Chỉ thêm vào `Production` hoặc các environment cần dùng. Không dùng URL `localhost`/`127.0.0.1` trong Vercel.

Sau khi đổi environment variable, tạo deployment mới để runtime nhận giá trị mới.

## 5.1. Cấu hình tiết kiệm nhất: worker trên máy cá nhân + Cloudflare Tunnel

Phù hợp để thử nghiệm với chi phí thấp. Máy cá nhân phải bật, có mạng và không được sleep trong lúc worker xử lý.

Terminal 1 — chạy worker từ repository root:

```bash
source worker/.venv/bin/activate
export HOST=127.0.0.1
export PORT=8787
export WORKER_AUTH_TOKEN='random-secret-dai'
python3 -m worker.server
```

Terminal 2 — expose HTTPS tạm thời:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Cloudflare sẽ in ra một URL HTTPS dạng `https://<random>.trycloudflare.com`. Dùng URL đó làm `TRANSCRIPTION_WORKER_URL` trên Vercel, cùng token ở hai phía. Kiểm tra:

```bash
curl https://<random>.trycloudflare.com/health
```

Quick Tunnel có URL thay đổi và phù hợp test, không phù hợp production lâu dài. Muốn URL cố định, tạo named tunnel và chạy cloudflared như một service trên máy hoặc VPS.

## 5.2. Cấu hình ổn định: worker trên VPS/managed host

1. Tạo máy/host có Python, FFmpeg và đủ disk/RAM cho Whisper.
2. Clone repository.
3. Cài worker theo [worker/README.md](../worker/README.md).
4. Chạy worker bind trong private network hoặc `0.0.0.0` phía sau HTTPS reverse proxy.
5. Đặt `WORKER_AUTH_TOKEN` trên host, không commit vào repository.
6. Mở firewall chỉ cho traffic cần thiết.
7. Trỏ `TRANSCRIPTION_WORKER_URL` tới domain HTTPS của worker.
8. Kiểm tra `/health`, sau đó test TikTok và YouTube từ production.

Worker hiện dùng SQLite bền vững, recovery job sau restart, deadline, heartbeat/stale recovery, cancel process, dead-letter, rate limit submit và chỉ chạy một job đồng thời. Metrics hiện là counter tối thiểu; chưa có multi-worker coordination.

## 5.3. Checklist kiểm tra đúng environment

Trên Vercel, mở `Deployments → deployment production → Functions → Logs`, gửi một request mới rồi kiểm tra:

- TikTok/Facebook trả `202`, không còn `PROVIDER_NOT_READY`;
- YouTube có caption trả `200`;
- YouTube bị rate-limit sẽ trả `202` nếu worker đã cấu hình;
- worker nhận `Authorization: Bearer ...`;
- không log token trong Vercel hoặc worker.

Request test TikTok:

```bash
curl -i -X POST https://clipread-five.vercel.app/api/transcript \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.tiktok.com/@demo/video/1234567890123456789","language":"auto"}'
```

URL ví dụ có thể không tồn tại; mục tiêu của test này là kiểm tra route có trả `PROVIDER_NOT_READY` hay đã trả `202`/lỗi upstream từ worker.

## 6. Triển khai worker

Worker cần một máy/process riêng có:

- Python 3.11+;
- `yt-dlp`;
- FFmpeg;
- `openai-whisper`;
- network outbound tới nguồn video;
- HTTPS reverse proxy nếu worker không chạy private network.

Khởi động worker:

```bash
export HOST=127.0.0.1
export PORT=8787
export WORKER_AUTH_TOKEN='random-long-secret'
python3 -m worker.server
```

Khi đặt sau reverse proxy/public network:

- bind worker trong private network nếu có thể;
- bắt buộc `WORKER_AUTH_TOKEN`;
- chỉ cho phép Vercel/API caller truy cập;
- bật HTTPS;
- không ghi token vào access log;
- kiểm tra `GET /health` trả JSON `{"status":"ok"}`.

Worker hiện có SQLite persistence, recovery sau restart, cancel/deadline và rate limit cơ bản nhưng chưa tự scale hoặc có lease giữa nhiều worker. Không dùng cấu hình này cho public traffic lớn nếu chưa bổ sung coordination và monitoring.

Worker cung cấp `GET /metrics` có auth để kiểm tra nhanh số job bắt đầu, hoàn tất, thất bại, retry và request bị rate limit. Đây là metrics tối thiểu, chưa thay thế Prometheus/OpenTelemetry.

## 7. Branch protection

Trên GitHub → `Settings` → `Branches` → branch rule cho `main`:

- Require a pull request before merging;
- Require status checks: `CI / Quality, tests, build, E2E`;
- Require branches to be up to date nếu team cần strict merge;
- Restrict force push;
- bật conversation resolution nếu dùng code review.

Luồng chuẩn:

```text
feature/* → Pull Request → CI pass → merge main → deploy production
```

## 8. Smoke test sau deploy

### App

1. Mở production URL.
2. Dán YouTube public URL có caption.
3. Kiểm tra transcript, reading mode, raw caption, copy và export.
4. Kiểm tra URL không hỗ trợ trả lỗi rõ ràng.

### Worker

```bash
curl -i https://worker.example.com/health
curl -i -H 'Authorization: Bearer <token>' https://worker.example.com/jobs/<job-id>
```

Sau đó kiểm tra:

- TikTok/Facebook trả `202` khi worker bật;
- progress chuyển qua các stage;
- job hoàn tất hoặc lỗi có code rõ ràng;
- video không caption chạy Whisper khi worker có đủ dependency.

## 9. Rollback và xử lý lỗi

- Vercel Git Integration: chọn deployment trước đó và promote lại.
- GitHub Actions: revert commit lỗi, chờ CI pass rồi deploy commit mới.
- Worker: giữ process cũ/rollback image hoặc commit worker trước đó; kiểm tra `/health` sau restart.
- Nếu app trả `WORKER_UNAVAILABLE`, kiểm tra URL, HTTPS, firewall và hai token.
- Nếu nhận `429`, giảm tần suất thử lại và kiểm tra upstream rate limit; không tự động tạo thêm Whisper job.

## 10. Các bước chưa tự động hóa

- deploy worker Python;
- test transcript với URL public thật;
- Redis migration vì single-worker SQLite hiện đáp ứng phạm vi MVP;
- monitoring/alerting và rate limit production.

Đây là các hạng mục cần hoàn thiện trước khi mở public traffic lớn.
