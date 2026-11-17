import { searchTranscript } from '@/domain/insights';
import { createSemanticSearchIndex } from '@/domain/semantic-search';
import type { TranscriptSegment } from '@/domain/transcript';

const cases = [
  { query: 'SQLite backup', expected: [0] },
  { query: 'worker heartbeat', expected: [1] },
  { query: 'tìm transcript', expected: [2] },
];
const segments: TranscriptSegment[] = [
  { text: 'SQLite backup giúp khôi phục job an toàn.', offset: 0, duration: 3 },
  { text: 'Worker heartbeat phát hiện job stale.', offset: 3, duration: 3 },
  { text: 'Tìm transcript bằng từ khóa trong bài đọc.', offset: 6, duration: 3 },
];
const semantic = createSemanticSearchIndex(segments);

for (const item of cases) {
  const lexical = searchTranscript(segments, item.query).map((result) => result.segmentId);
  const ranked = semantic.search(item.query, 3).map((result) => result.segmentId);
  const recall = (ids: number[]) => item.expected.filter((id) => ids.includes(id)).length / item.expected.length;
  console.log(
    JSON.stringify({ query: item.query, lexicalRecallAt3: recall(lexical), rankingRecallAt3: recall(ranked) }),
  );
}
