import assert from 'node:assert/strict';
import test from 'node:test';
import { YouTubeTranscriptProvider } from './youtube-transcript-provider';
import type { fetchTranscript } from 'youtube-transcript-plus';

test('YouTube provider aborts an upstream request that exceeds its timeout', async () => {
  const fetcher = (async (_url: string, config?: { signal?: AbortSignal }) =>
    new Promise<never>((_resolve, reject) => {
      config?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      });
    })) as typeof fetchTranscript;
  const provider = new YouTubeTranscriptProvider(fetcher, 5);

  await assert.rejects(
    provider.getTranscript('https://www.youtube.com/watch?v=timeout'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'YOUTUBE_TIMEOUT',
  );
});
