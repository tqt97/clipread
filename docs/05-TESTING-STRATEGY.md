# ClipRead — Chiến lược kiểm thử

## 1. Mục tiêu

Không chỉ test UI; cần kiểm chứng cả provider contract và khả năng chống thay đổi upstream.

## 2. Unit tests

### URL/platform detection

Cases:

- youtube.com/watch
- youtu.be
- YouTube Shorts
- TikTok URL
- Facebook Reel URL
- invalid URL
- unknown domain

### Transcript normalization

Test:

- whitespace;
- empty segments;
- HTML entities;
- punctuation;
- paragraph grouping;
- timestamp formatting.

### Export

- Markdown structure.
- TXT plain text.
- SRT numbering/timestamps.
- Unicode Vietnamese/Japanese.

## 3. Provider contract tests

Mỗi provider phải qua cùng test contract:

```text
supports(valid URL) = true
supports(other platform) = false
extract() returns TranscriptDocument
segments ordered by `offset`
segments text not empty
```

## 4. Integration tests

YouTube nên có một tập public fixture URL được kiểm tra thủ công/CI có kiểm soát.

Không phụ thuộc hoàn toàn vào một video duy nhất.

Test matrix:

| Case | Expected |
|---|---|
| Public video + manual captions | success |
| Public video + auto captions | success nếu provider hỗ trợ |
| Video không caption | `TRANSCRIPT_NOT_FOUND` |
| Invalid URL | `INVALID_URL` |
| TikTok/Facebook MVP | `PROVIDER_NOT_READY` |

## 5. E2E

Flow chính:

```text
Paste URL
→ submit
→ loading
→ result
→ switch mode
→ copy/export
```

Nên dùng Playwright khi UI ổn định.

## 6. Regression policy

Mỗi lần upstream provider thay đổi:

1. thêm regression test;
2. fix provider adapter;
3. không sửa UI contract nếu không cần;
4. ghi CHANGELOG.

## 7. Điều kiện chặn release

Không release nếu chưa pass:

```bash
npm run typecheck
npm run build
```

Khi đã cài test runner:

```bash
npm test                 # chưa có script ở baseline hiện tại
npm run test:e2e         # thêm khi UI ổn định
```
