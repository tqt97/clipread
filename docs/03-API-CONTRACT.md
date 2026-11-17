# ClipRead — Contract API

## `POST /api/transcript`

### Request

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "language": "vi"
}
```

`url` phải là chuỗi HTTP/HTTPS dài không quá 2048 ký tự. `language` là chuỗi tùy chọn; `auto` hoặc bỏ trống để provider tự chọn.

### Thành công — `200`

```json
{
  "document": {
    "sourceUrl": "https://...",
    "platform": "youtube",
    "title": "Tiêu đề video",
    "author": "Kênh",
    "durationSeconds": 600,
    "language": "vi",
    "segments": [
      { "offset": 0, "duration": 2.5, "text": "...", "lang": "vi" }
    ]
  }
}
```

### Lỗi

```json
{
  "error": "URL phải là địa chỉ HTTP hoặc HTTPS hợp lệ.",
  "code": "INVALID_URL"
}
```

`error` là thông báo hiển thị được cho người dùng; `code` là mã ổn định để UI xử lý. Route hiện không trả raw exception.

### Xử lý qua worker — `202`

Khi có `TRANSCRIPTION_WORKER_URL`, API gửi job sang worker local và trả về ngay:

```json
{
  "jobId": "8c6...",
  "status": "queued"
}
```

Client kiểm tra `GET /api/transcript/jobs/{jobId}` cho tới khi `completed` hoặc `failed`. Worker ưu tiên caption; nếu không có caption thì dùng audio + Whisper local.

Khi user bấm dừng, client gọi `POST /api/transcript/jobs/{jobId}/cancel`. Route chuyển yêu cầu tới `POST /jobs/{jobId}/cancel` của worker. Worker đánh dấu `cancel_requested`, terminate tiến trình yt-dlp/FFmpeg/Whisper con và kết thúc job với trạng thái `cancelled`.

Nếu YouTube provider trả rate-limit từ Vercel và worker đã cấu hình, API cũng tạo job `202` để worker xử lý bằng IP/runtime riêng. Nếu chưa có worker, API trả `503 UPSTREAM_ERROR` với hướng dẫn cấu hình worker thay vì giả định video không có caption.

Nếu worker chạy remote, Next.js gửi `Authorization: Bearer ...` từ `TRANSCRIPTION_WORKER_TOKEN`; worker yêu cầu token tương ứng trong `WORKER_AUTH_TOKEN`.

| HTTP | Code | Ý nghĩa |
|---:|---|---|
| 400 | `INVALID_REQUEST` | Body không phải JSON hợp lệ |
| 400 | `INVALID_URL` | Thiếu URL, sai protocol hoặc quá dài |
| 422 | `UNSUPPORTED_PLATFORM` | URL hợp lệ nhưng chưa nhận diện nền tảng |
| 422 | `PROVIDER_NOT_READY` | Đã nhận diện nền tảng nhưng chưa có adapter |
| 422 | `TRANSCRIPT_NOT_FOUND` | Không có caption khả dụng |
| 502 | `VIDEO_UNAVAILABLE` | Video bị gỡ, private hoặc không thể truy cập |
| 502 | `WORKER_UNAVAILABLE` | Không kết nối hoặc worker gặp lỗi |
| 502 | `WORKER_UNAUTHORIZED` | Token giữa app và worker không khớp |
| 429 | `QUEUE_FULL` | Worker đã đạt giới hạn job đang chờ/chạy |
| 429 | `WORKER_RATE_LIMITED` | Worker giới hạn tần suất submit từ client |
| 429 | `API_RATE_LIMITED` | API giới hạn request theo client IP |
| 504 | `YOUTUBE_TIMEOUT` | YouTube không phản hồi trong thời gian cho phép |
| 503 | `YOUTUBE_RATE_LIMITED` | YouTube đang giới hạn request |
| 502 | `UPSTREAM_ERROR` | Provider/upstream thất bại |

## Ghi chú contract

- `offset` và `duration` tính bằng giây, không phải mili-giây.
- `segments` đã được làm sạch và loại segment có text rỗng.
- `202` chỉ có nghĩa là job đã được nhận, không phải transcript đã sẵn sàng.
- Cancel là best-effort theo job: request đã chạy được dừng ở process boundary; trạng thái cuối phải đọc lại từ worker.
- Workspace export dùng `schemaVersion: 1`, giới hạn 2 MB và chỉ nhận URL thuộc platform đã hỗ trợ.
- Share link có dạng `/?url=<encoded-source>#segment-<id>` và tự khởi động extraction khi mở.
- API hiện chưa version hóa vì mới là MVP; khi breaking change xuất hiện phải cập nhật client, test và tài liệu cùng lúc.
- UI không hiển thị raw exception; client ánh xạ `code` sang thông báo tiếng Việt và hành động retry phù hợp.
- Static review xác nhận shape từ source; chưa có kiểm thử HTTP runtime với upstream thật.
