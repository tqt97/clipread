import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscriptWorkspace } from './workspace';

const valid = {
  schemaVersion: 1,
  document: {
    sourceUrl: 'https://www.youtube.com/watch?v=demo',
    platform: 'youtube',
    title: 'Demo',
    segments: [{ text: 'Hello', offset: 0, duration: 1 }],
  },
  bookmarks: [0, 9],
  notes: { '0': 'Ghi chú' },
};

describe('workspace parser', () => {
  it('accepts a valid export and removes out-of-range bookmarks', () => {
    assert.deepEqual(parseTranscriptWorkspace(valid).bookmarks, [0]);
  });

  it('rejects unsupported source and invalid segment shape', () => {
    assert.throws(() =>
      parseTranscriptWorkspace({ ...valid, document: { ...valid.document, sourceUrl: 'https://example.com/video' } }),
    );
    assert.throws(() => parseTranscriptWorkspace({ ...valid, document: { ...valid.document, platform: 'tiktok' } }));
    assert.throws(() =>
      parseTranscriptWorkspace({
        ...valid,
        document: { ...valid.document, segments: [{ text: 1, offset: 0, duration: 1 }] },
      }),
    );
    assert.throws(() => parseTranscriptWorkspace({ ...valid, notes: { '8': 'Sai vị trí' } }));
  });

  it('rejects oversized files', () => {
    assert.throws(() => parseTranscriptWorkspace(valid, 2_100_000));
  });
});
