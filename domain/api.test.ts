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

test('presentTranscriptError explains a full worker queue', () => {
  assert.deepEqual(presentTranscriptError('QUEUE_FULL'), {
    title: 'Worker đang quá tải',
    message: 'Có quá nhiều video đang chờ xử lý. Hãy thử lại sau ít phút.',
    retryable: true,
  });
});

test('presentTranscriptError explains a YouTube timeout', () => {
  assert.deepEqual(presentTranscriptError('YOUTUBE_TIMEOUT'), {
    title: 'YouTube phản hồi quá lâu',
    message: 'Không nhận được transcript trong thời gian cho phép. Hãy thử lại hoặc dùng worker riêng.',
    retryable: true,
  });
});

test('presentTranscriptError explains worker rate limiting', () => {
  assert.deepEqual(presentTranscriptError('WORKER_RATE_LIMITED'), {
    title: 'Worker đang giới hạn yêu cầu',
    message: 'Có quá nhiều yêu cầu trong thời gian ngắn. Hãy đợi một lát rồi thử lại.',
    retryable: true,
  });
});

test('presentTranscriptError handles network and timeout separately', () => {
  assert.equal(presentTranscriptError(undefined, 'network').retryable, true);
  assert.match(presentTranscriptError(undefined, 'timeout').message, /video ngắn hơn/);
});
