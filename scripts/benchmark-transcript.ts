import { performance } from 'node:perf_hooks';
import { searchTranscript } from '../domain/insights';
import { createSemanticSearchIndex } from '../domain/semantic-search';
import type { TranscriptSegment } from '../domain/transcript';

const sizes = [1_000, 5_000, 20_000];
const queries = ['worker local', 'chi phí', 'transcript', 'không tồn tại', 'xử lý video'];

const createSegments = (size: number): TranscriptSegment[] =>
  Array.from({ length: size }, (_, index) => ({
    text: `Đoạn ${index} nói về worker local xử lý transcript và tối ưu chi phí xử lý video.`,
    offset: index * 3,
    duration: 3,
    lang: 'vi',
  }));

const percentile = (values: number[], target: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * target))];
};

for (const size of sizes) {
  const segments = createSegments(size);
  const semanticIndex = createSemanticSearchIndex(segments);
  const lexicalDurations = queries.flatMap((query) => {
    const samples: number[] = [];
    for (let run = 0; run < 10; run += 1) {
      const startedAt = performance.now();
      searchTranscript(segments, query);
      samples.push(performance.now() - startedAt);
    }
    return samples;
  });
  const semanticDurations = queries.flatMap((query) => {
    const samples: number[] = [];
    for (let run = 0; run < 10; run += 1) {
      const startedAt = performance.now();
      semanticIndex.search(query);
      samples.push(performance.now() - startedAt);
    }
    return samples;
  });
  console.log(
    JSON.stringify({
      segments: size,
      lexicalP50Ms: Number(percentile(lexicalDurations, 0.5).toFixed(2)),
      lexicalP95Ms: Number(percentile(lexicalDurations, 0.95).toFixed(2)),
      semanticP50Ms: Number(percentile(semanticDurations, 0.5).toFixed(2)),
      semanticP95Ms: Number(percentile(semanticDurations, 0.95).toFixed(2)),
    }),
  );
}
