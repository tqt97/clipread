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

| HTTP | Code | Ý nghĩa |
|---:|---|---|
| 400 | `INVALID_REQUEST` | Body không phải JSON hợp lệ |
| 400 | `INVALID_URL` | Thiếu URL, sai protocol hoặc quá dài |
| 422 | `UNSUPPORTED_PLATFORM` | URL hợp lệ nhưng chưa nhận diện nền tảng |
| 422 | `PROVIDER_NOT_READY` | Đã nhận diện nền tảng nhưng chưa có adapter |
| 422 | `TRANSCRIPT_NOT_FOUND` | Không có caption khả dụng |
| 502 | `UPSTREAM_ERROR` | Provider/upstream thất bại |

## Ghi chú contract

- `offset` và `duration` tính bằng giây, không phải mili-giây.
- `segments` đã được làm sạch và loại segment có text rỗng.
- API hiện chưa version hóa vì mới là MVP; khi breaking change xuất hiện phải cập nhật client, test và tài liệu cùng lúc.
- Static review xác nhận shape từ source; chưa có kiểm thử HTTP runtime với upstream thật.
