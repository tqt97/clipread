# ClipRead — Pipeline xử lý transcript

## 1. Mục tiêu

Pipeline phải chuyển subtitle/caption thô thành nội dung đọc được nhưng vẫn giữ khả năng truy ngược về transcript gốc.

## 2. Pipeline MVP

```text
URL
→ Validate
→ Detect platform
→ Select TranscriptProvider
→ Fetch metadata + captions
→ Normalize segments
→ Build TranscriptDocument
→ Render readable mode
→ Export
```

## 3. Normalize segment

Mỗi segment nên chuẩn hóa:

- trim whitespace;
- decode HTML entities nếu provider trả encoded text;
- loại bỏ whitespace lặp;
- giữ nguyên nội dung ngữ nghĩa;
- không tự tóm tắt;
- không tự dịch;
- không tự sửa ý người nói.

## 4. Readable paragraph mode

Mục tiêu: biến caption nhỏ thành đoạn đọc được.

Heuristic ban đầu:

- nối các segment gần nhau theo timeline;
- kết thúc paragraph khi đủ độ dài;
- ưu tiên ngắt tại punctuation;
- hiện chưa ngắt theo khoảng trống timeline; đây là điểm cần cân nhắc ở v0.2;
- giới hạn paragraph để không thành một khối text quá dài.

Không được phá dữ liệu segment gốc. Readable paragraph là một projection.

```text
TranscriptDocument.segments
       ↓ projection
ReadableParagraph[]
```

## 5. Timestamp

Timestamp phải lấy từ segment gốc.

Format hiển thị:

```text
00:00
03:27
01:02:15
```

Ở v0.2, timestamp có thể trở thành deep link về source video.

## 6. Export Markdown

Đề xuất output:

```md
# Video title

- Source: https://...
- Author: ...
- Duration: ...
- Language: ...

## Transcript

Paragraph...
```

Không chèn AI summary vào cùng section transcript.

## 7. Export TXT

TXT chỉ nên chứa readable text hoặc caption text tùy mode.

Không bắt buộc metadata nếu user chọn output tối giản.

## 8. Export SRT

SRT phải dùng segment-level timing.

```text
1
00:00:01,000 --> 00:00:04,000
First caption
```

Provider YouTube hiện trả duration cho segment và code dùng trực tiếp `offset + duration`; chưa có nhánh suy duration từ segment kế tiếp.

## 9. Language selection

MVP hiện có preference cố định:

- Vietnamese
- English
- Japanese

Roadmap nên chuyển sang:

```text
Fetch available caption tracks
→ display real languages
→ user chooses
→ provider extracts exact track
```

## 10. Future AI processing

AI không được ghi đè transcript.

Kiến trúc:

```text
TranscriptDocument
├── Original transcript
├── Summary
├── Key ideas
├── Chapters
├── Action items
└── Translation
```

Mọi derived artifact cần metadata:

- source transcript id/hash;
- model/provider;
- generated_at;
- language;
- processing version.
