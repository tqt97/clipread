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

### Transcript insights

Test tại domain seam `domain/insights.ts`:

- search không phân biệt hoa thường và trả đúng segment/timestamp;
- keyword ranking deterministic, loại stop words và không mutate transcript;
- highlights có thể truy về segment nguồn;
- YouTube timestamp URL thêm `t`, platform khác giữ nguyên URL.

### Knowledge features

Test tại domain seam `domain/knowledge.ts`:

- chapters tách theo khoảng ngắt thời gian;
- extractive summary chỉ chọn đoạn có keyword và giữ source order;
- action items nhận diện được mẫu câu Việt/Anh;
- Q&A chỉ trả về các đoạn transcript khớp, không sinh nội dung ngoài nguồn.

### Error presentation

- mã lỗi API được chuyển thành thông báo tiếng Việt có hướng dẫn hành động;
- lỗi network, timeout, worker unavailable và video unavailable có hành vi retry riêng.

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
| Video không caption + worker | fallback Whisper |
| Video không caption, không worker | `TRANSCRIPT_NOT_FOUND` |
| Invalid URL | `INVALID_URL` |
| TikTok/Facebook, có worker | job `202` rồi `completed`/`failed` |
| TikTok/Facebook, không worker | `PROVIDER_NOT_READY` |

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

Playwright hiện đã được bật tại `e2e/` với API fixture; CI chạy trên production build local và không phụ thuộc upstream video thật.

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
npm run test:domain
npm run test:worker
npm run build
npm run test:e2e
```

E2E browser dùng API fixture để kiểm tra flow UI ổn định; test runtime với URL public thật vẫn cần chạy riêng vì phụ thuộc upstream và rate limit.
