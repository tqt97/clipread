# Desktop app Tauri

## Mục tiêu

ClipRead desktop được đóng gói thành installer cho macOS và Windows. Người dùng cuối chỉ cần cài `.dmg`, `.app`, `.msi` hoặc `.exe`, sau đó click app để tự mở browser mặc định; không cần cài Node.js, Python, FFmpeg, yt-dlp hay Whisper. Windows installer dùng `embedBootstrapper` cho WebView2; installer sẽ xử lý thành phần nền này nếu máy chưa có.

## Kiến trúc runtime

Tauri là vỏ native. Khi mở app, Rust khởi động Next standalone server tại `127.0.0.1:3000` và worker Python tại `127.0.0.1:8787`. Bundle chứa Node runtime, worker PyInstaller, yt-dlp, FFmpeg và model Whisper `base.pt`. Next server nhận token worker do Tauri tạo trong phiên chạy; worker chỉ bind localhost. Bản Windows dùng `windows_subsystem = "windows"`, `CREATE_NO_WINDOW` và PyInstaller `--noconsole`, nên không mở thêm cửa sổ terminal khi người dùng chạy `.exe`.

Mặc định app dùng browser mode và có tray menu `Thoát ClipRead` để dừng runtime. Muốn dùng cửa sổ Tauri native trong môi trường phát triển, chạy app với environment variable `CLIPREAD_NATIVE_WINDOW=1`.

## Chạy khi phát triển

```bash
npm install
npm run tauri:icons
npm run build
npm run desktop:runtime
npm run desktop:prepare
npm run desktop:validate
npm run tauri:build
```

`desktop:runtime` tự tải Node/yt-dlp, lấy FFmpeg, tạo virtualenv Python, cài Whisper/PyInstaller, build worker và chuẩn bị model. Nếu bundle đã có worker executable, script sẽ dùng lại và không yêu cầu Python. Khi cần build worker mới, dùng Python 3.11 hoặc 3.12; Python 3.13+ bị từ chối vì bộ wheel `numba/llvmlite` dùng cho macOS Intel không ổn định. Máy người dùng cuối không cần các tool trên; các tool chỉ cần ở máy build hoặc GitHub Actions.

## Release bằng GitHub Actions

Workflow [desktop-release.yml](../.github/workflows/desktop-release.yml) build macOS Apple Silicon trên `macos-15`, macOS Intel trên `macos-15-intel` và Windows 64-bit. Không dùng `macos-14` vì label này có thể bị GitHub map sang cấu hình arm64 không khả dụng với một số repository/account.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions sẽ cài dependency, tải Node/yt-dlp/FFmpeg, tải model Whisper, build worker bằng PyInstaller, tạo icon Tauri, chạy test và tạo release draft. Sau khi kiểm tra artifact, maintainer publish draft release. Workflow dispatch dùng để build artifact kiểm thử không gắn tag.

## Kiểm tra bắt buộc

`desktop:validate` chặn build nếu thiếu Next `server.js`, Node runtime, worker executable, yt-dlp, FFmpeg hoặc `base.pt`. `tauri:icons` sinh `icon.icns`, `icon.ico` và PNG chuẩn từ `src-tauri/icons/icon.svg`; phải chạy trước `tauri build` để tránh lỗi installer thiếu icon.

## Ký ứng dụng

Bản unsigned vẫn build được nhưng macOS có thể hiện cảnh báo Gatekeeper và Windows có thể hiện cảnh báo SmartScreen. Production nên cấu hình Apple Developer certificate và các secret `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`; Windows cần certificate signing tương ứng.

## Dữ liệu và giới hạn

SQLite job state nằm trong thư mục app data của hệ điều hành, không nằm trong thư mục cài đặt. Model và binary runtime nằm trong resources và không tự tải thêm khi người dùng chạy. Model `base` làm installer lớn và Whisper vẫn phụ thuộc CPU/GPU; upstream YouTube/TikTok/Facebook vẫn có thể giới hạn request.
