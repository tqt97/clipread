import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TranscriptSegment } from './transcript';
import { extractTranscriptInsights, searchTranscript, toTimestampUrl } from './insights';

const segments: TranscriptSegment[] = [
  { text: 'ClipRead dùng worker local để chạy Whisper nhanh.', offset: 12, duration: 4, lang: 'vi' },
  { text: 'Worker local giúp giảm chi phí và kiểm soát dữ liệu.', offset: 20, duration: 5, lang: 'vi' },
  { text: 'Vercel phù hợp cho giao diện và API ngắn.', offset: 30, duration: 4, lang: 'vi' },
];

test('searchTranscript returns matching segments with match counts', () => {
  assert.deepEqual(searchTranscript(segments, 'worker'), [
    { segmentId: 0, text: segments[0].text, offset: 12, duration: 4, matchCount: 1 },
    { segmentId: 1, text: segments[1].text, offset: 20, duration: 5, matchCount: 1 },
  ]);
});

test('searchTranscript ignores Vietnamese accents when matching', () => {
  assert.equal(
    searchTranscript([{ text: 'Chi phí worker thấp.', offset: 1, duration: 2 }], 'chi phi')[0].matchCount,
    1,
  );
});

test('extractTranscriptInsights returns deterministic keywords and highlights without mutating segments', () => {
  const snapshot = structuredClone(segments);
  const insights = extractTranscriptInsights(segments, { keywordLimit: 5, highlightLimit: 2 });

  assert.deepEqual(segments, snapshot);
  const workerKeyword = insights.keywords.find((keyword) => keyword.term === 'worker');
  assert.deepEqual(workerKeyword, { term: 'worker', count: 2, segmentIds: [0, 1] });
  assert.deepEqual(
    insights.keywords.find((keyword) => keyword.term === 'worker local'),
    { term: 'worker local', count: 2, segmentIds: [0, 1] },
  );
  assert.equal(
    insights.keywords.some((keyword) => keyword.term === 'của'),
    false,
  );
  assert.equal(insights.highlights.length, 2);
  assert.equal(insights.highlights[0].segmentId, 1);
});

test('extractTranscriptInsights does not invent highlights for a short non-repetitive transcript', () => {
  const insights = extractTranscriptInsights([
    { text: 'Một ý duy nhất.', offset: 0, duration: 2 },
    { text: 'Ý khác hoàn toàn.', offset: 3, duration: 2 },
  ]);

  assert.deepEqual(insights.highlights, []);
});

test('keyword phrases stay contiguous and do not cross stop words', () => {
  const insights = extractTranscriptInsights([
    { text: 'Worker để chạy nhanh.', offset: 0, duration: 2 },
    { text: 'Worker để chạy ổn định.', offset: 3, duration: 2 },
  ]);
  assert.equal(
    insights.keywords.some((keyword) => keyword.term === 'worker chạy'),
    false,
  );
});

test('toTimestampUrl creates a YouTube timestamp link and keeps other platforms unchanged', () => {
  assert.equal(
    toTimestampUrl('https://www.youtube.com/watch?v=demo', 75),
    'https://www.youtube.com/watch?v=demo&t=75s',
  );
  assert.equal(toTimestampUrl('https://youtu.be/demo?t=3s', 75), 'https://youtu.be/demo?t=75s');
  assert.equal(
    toTimestampUrl('https://www.facebook.com/reel/1?foo=bar', 75),
    'https://www.facebook.com/reel/1?foo=bar',
  );
  assert.equal(toTimestampUrl('https://www.tiktok.com/@demo/video/1', 75), 'https://www.tiktok.com/@demo/video/1');
});
