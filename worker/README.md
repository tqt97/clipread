# ClipRead local worker

Worker này dùng `yt-dlp` để lấy metadata/caption và dùng Whisper local khi video không có caption. Không cần API key speech-to-text.

## Cài đặt trên macOS

```bash
brew install ffmpeg
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
python3 -m worker.server
```

Mặc định worker chạy tại `http://127.0.0.1:8787`.

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Kết quả mong đợi: `{"status": "ok", "service": "clipread-worker"}`.

Metrics tối thiểu (cần token nếu worker bật auth):

```bash
curl -H "Authorization: Bearer $WORKER_AUTH_TOKEN" http://127.0.0.1:8787/metrics
```

Backup SQLite trước khi nâng cấp hoặc restart máy:

```bash
python3 -m worker.backup worker/data/jobs-$(date +%Y%m%d-%H%M%S).sqlite3
```

Trong terminal chạy Next.js:

```bash
export TRANSCRIPTION_WORKER_URL=http://127.0.0.1:8787
npm run dev
```

Nếu worker chạy trên máy khác, cấu hình cùng một token ở hai phía:

```bash
export WORKER_AUTH_TOKEN='mot-token-dai-ngau-nhien'
export TRANSCRIPTION_WORKER_TOKEN='mot-token-dai-ngau-nhien'
```

Worker sẽ từ chối khởi động khi bind ra ngoài localhost mà chưa có `WORKER_AUTH_TOKEN`.

Khi biến này được cấu hình, pipeline thử nghiệm TikTok/Facebook đi qua worker. YouTube vẫn dùng provider caption nhanh hiện tại trước; chỉ khi YouTube không có caption thì API mới chuyển sang worker để chạy fallback Whisper. Worker ưu tiên caption có sẵn; nếu không có thì tải audio tạm, chạy Whisper và xóa thư mục tạm sau job.

## Chọn model

```bash
WHISPER_MODEL=tiny   # nhẹ nhất, độ chính xác thấp hơn
WHISPER_MODEL=base   # cân bằng cho máy cá nhân
WHISPER_MODEL=small  # tốt hơn nhưng chậm/nặng hơn
```

## Giới hạn MVP

- Job state được lưu trong SQLite tại `JOB_DB_PATH` (mặc định `worker/data/jobs.sqlite3`); restart worker có thể khôi phục job đang chờ và job stale, đồng thời giữ nguyên `attempt`.
- Mỗi job có deadline `JOB_DEADLINE_SECONDS`, heartbeat và stale recovery sau `JOB_STALE_SECONDS`.
- Job đang chạy có lease token ngắn hạn; heartbeat gia hạn lease để tránh hai worker xử lý trùng cùng một job.
- `POST /jobs/{jobId}/cancel` gửi yêu cầu dừng thật; yt-dlp, FFmpeg và tiến trình Whisper con sẽ bị terminate.
- Job mutation khi đang chạy có lease fencing; worker cũ không được phép ghi đè kết quả worker mới.
- Chỉ chạy một job cùng lúc và giới hạn thêm một job đang chờ để không làm máy quá tải.
- Job hoàn tất/lỗi được dọn sau `JOB_TTL_SECONDS`.
- Submit cùng URL và ngôn ngữ sẽ dùng lại job đang chạy/đã hoàn tất trong TTL; upstream failure retry giới hạn bởi `MAX_JOB_ATTEMPTS`, riêng lỗi 429 không retry mù.
- Worker giới hạn số lần submit theo client bằng `MAX_SUBMISSIONS_PER_WINDOW` và `SUBMISSION_WINDOW_SECONDS`.
- Worker nên chạy local hoặc trong mạng riêng; không expose trực tiếp ra Internet.
- Chỉ xử lý URL/nội dung mà người dùng có quyền truy cập và sử dụng.
