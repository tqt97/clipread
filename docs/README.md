# Bộ tài liệu ClipRead

Đây là bộ tài liệu source-of-truth cho phạm vi MVP và nền tảng trước khi phát triển feature tiếp theo. Nội dung viết bằng tiếng Việt; các tên code, protocol và thư viện giữ nguyên để tra cứu trực tiếp.

## Thứ tự đọc

1. `00-OVERVIEW.md` — mục tiêu, phạm vi và nguyên tắc sản phẩm
2. `10-SOURCE-REVIEW-AND-BASELINE.md` — kết quả review source và các điểm đã làm sạch
3. `01-ARCHITECTURE.md` — module, seam và luồng dữ liệu
4. `02-TRANSCRIPT-PIPELINE.md` — chuẩn hóa transcript và các projection
5. `03-API-CONTRACT.md` — request, response và mã lỗi thật
6. `04-SECURITY-AND-PRIVACY.md` — threat model và chính sách dữ liệu
7. `05-TESTING-STRATEGY.md` — chiến lược kiểm thử và release gate
8. `06-DEPLOYMENT-VERCEL.md` — triển khai và giới hạn runtime
9. `07-DEVELOPMENT-PLAN.md` — kế hoạch theo milestone
10. `08-ROADMAP.md` — roadmap rút gọn
11. `09-RELEASE-CHECKLIST.md` — checklist trước release
12. `../worker/README.md` — cài đặt worker yt-dlp và Whisper local

## Quy tắc cập nhật

Khi đổi contract hoặc behavior, cập nhật source, test và tài liệu trong cùng một thay đổi. Nếu chỉ review tĩnh thì ghi rõ; không dùng tài liệu để suy ra runtime production.
