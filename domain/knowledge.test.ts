import assert from 'node:assert/strict';
import test from 'node:test';
import type { TranscriptSegment } from './transcript';
import { answerTranscriptQuestion, buildTranscriptChapters, extractActionItems, extractiveSummary } from './knowledge';

const segments: TranscriptSegment[] = [
  { text: 'ClipRead dùng worker local để xử lý transcript.', offset: 0, duration: 5 },
  { text: 'Cần kiểm tra caption trước khi dùng Whisper.', offset: 8, duration: 5 },
  { text: 'Worker local giúp giảm chi phí và chạy ổn định.', offset: 70, duration: 5 },
];

test('buildTranscriptChapters splits on meaningful time gaps', () => {
  const chapters = buildTranscriptChapters(segments, { gapSeconds: 30 });
  assert.equal(chapters.length, 2);
  assert.deepEqual(chapters[1].segmentIds, [2]);
});

test('extractiveSummary is deterministic and keeps source order', () => {
  const summary = extractiveSummary(segments, [{ term: 'worker', count: 2, segmentIds: [0, 2] }]);
  assert.deepEqual(
    summary.map((item) => item.segmentId),
    [0, 2],
  );
});

test('extractActionItems finds Vietnamese action language', () => {
  assert.equal(extractActionItems(segments)[0].segmentId, 1);
});

test('answerTranscriptQuestion returns grounded transcript matches', () => {
  const answer = answerTranscriptQuestion(segments, 'worker local');
  assert.equal(answer.confidence, 'high');
  assert.deepEqual(
    answer.results.map((result) => result.segmentId),
    [0, 2],
  );
});
