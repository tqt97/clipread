# ClipRead — Bảo mật và quyền riêng tư

## 1. Threat model chính

ClipRead nhận URL do user nhập và gọi upstream provider, vì vậy các rủi ro chính gồm:

- SSRF nếu backend fetch URL tùy ý;
- abuse/rate-limit;
- upstream HTML/API thay đổi;
- malicious metadata/text;
- XSS khi render transcript;
- resource exhaustion;
- logging nhầm URL/token nhạy cảm;
- retention dữ liệu ngoài ý muốn.

## 2. URL validation

Không dùng backend như generic URL fetcher.

Flow an toàn:

```text
Parse URL
→ validate protocol
→ detect known platform host
→ route sang provider cụ thể
→ provider tạo request theo rule riêng
```

Không cho user truyền arbitrary upstream hostname vào fetch layer.

## 3. XSS

Transcript và metadata là untrusted input.

- render dưới dạng text;
- không dùng `dangerouslySetInnerHTML` nếu không sanitize;
- escape file output phù hợp;
- không tin title/channel name.

## 4. Rate limiting

Khi public:

- limit request theo IP/session;
- cap concurrent extraction;
- response cache nếu phù hợp;
- detect abuse;
- trả `429` rõ ràng.

## 5. Privacy

MVP không lưu:

- account;
- media;
- transcript history;
- user library.

Nếu thêm persistence:

- công bố retention;
- cho phép delete;
- không log transcript toàn bộ mặc định;
- xác định dữ liệu nào là personal data.

## 6. Future worker security

Nếu thêm yt-dlp/FFmpeg:

- không concatenate shell command từ user input;
- truyền arguments dạng array;
- temp directory riêng theo job;
- file size/time limits;
- cleanup trong `finally`;
- worker network egress policy nếu có thể;
- caption URL phải giữ HTTP(S), cùng host nguồn hoặc thuộc nhóm CDN allowlist; đây là defense-in-depth, không thay thế egress policy ở hạ tầng;
- validate output path;
- không cho arbitrary custom args trong public product.

## 7. AI layer

Nếu dùng external LLM:

- transcript gửi ra bên thứ ba phải được disclose;
- có option không dùng AI;
- không gửi dữ liệu ngoài scope cần thiết;
- AI output phải gắn nhãn derived/generated.
