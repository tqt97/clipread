import assert from 'node:assert/strict';
import test from 'node:test';
import { presentTranscriptError } from './api';

test('presentTranscriptError gives actionable worker guidance', () => {
  assert.deepEqual(presentTranscriptError('WORKER_UNAVAILABLE'), {
    title: 'Worker đang không khả dụng',
    message: 'Không kết nối được tới worker xử lý video. Hãy kiểm tra worker hoặc thử lại sau.',
    retryable: true,
  });
});

test('presentTranscriptError handles network and timeout separately', () => {
  assert.equal(presentTranscriptError(undefined, 'network').retryable, true);
  assert.match(presentTranscriptError(undefined, 'timeout').message, /video ngắn hơn/);
});
