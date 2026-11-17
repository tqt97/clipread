import assert from 'node:assert/strict';
import test from 'node:test';
import { createSemanticSearchIndex } from './semantic-search';

test('semantic search ranks segments containing more query concepts first', () => {
  const index = createSemanticSearchIndex([
    { text: 'Worker xử lý audio.', offset: 0, duration: 2 },
    { text: 'Worker local xử lý transcript và tối ưu chi phí.', offset: 3, duration: 3 },
  ]);

  const results = index.search('worker transcript tối ưu');

  assert.equal(results[0].segmentId, 1);
  assert.equal(results[0].matchCount, 3);
});

test('semantic search ignores stop words and empty queries', () => {
  const index = createSemanticSearchIndex([{ text: 'Đây là nội dung transcript.', offset: 0, duration: 2 }]);

  assert.deepEqual(index.search('là và của'), []);
});
