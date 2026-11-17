import { cleanSegmentText, type TranscriptSegment } from './transcript';
import { normalizeSearchText, type TranscriptSearchResult } from './insights';

const STOP_WORDS = new Set(
  [
    'a',
    'an',
    'and',
    'are',
    'cho',
    'của',
    'có',
    'đã',
    'đang',
    'được',
    'để',
    'là',
    'một',
    'này',
    'những',
    'the',
    'to',
    'trong',
    'và',
    'với',
  ].map(normalizeSearchText),
);

const tokenize = (value: string): string[] =>
  normalizeSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

interface IndexedSegment {
  segmentId: number;
  text: string;
  offset: number;
  duration: number;
  termFrequency: Map<string, number>;
}

export interface SemanticSearchIndex {
  search: (query: string, limit?: number) => TranscriptSearchResult[];
}

export const createSemanticSearchIndex = (segments: TranscriptSegment[]): SemanticSearchIndex => {
  const indexedSegments: IndexedSegment[] = segments.map((segment, segmentId) => {
    const text = cleanSegmentText(segment.text);
    const termFrequency = new Map<string, number>();
    tokenize(text).forEach((token) => termFrequency.set(token, (termFrequency.get(token) || 0) + 1));
    return { segmentId, text, offset: segment.offset, duration: segment.duration, termFrequency };
  });
  const documentFrequency = new Map<string, number>();
  indexedSegments.forEach(({ termFrequency }) => {
    termFrequency.forEach((_, token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1));
  });

  const inverseDocumentFrequency = (token: string): number =>
    Math.log((indexedSegments.length + 1) / ((documentFrequency.get(token) || 0) + 1)) + 1;

  return {
    search: (query, limit = 8) => {
      const queryTokens = [...new Set(tokenize(query))];
      if (queryTokens.length === 0) return [];
      return indexedSegments
        .map((segment) => {
          const matchedTokens = queryTokens.filter((token) => segment.termFrequency.has(token));
          const score = matchedTokens.reduce((total, token) => {
            const termFrequency = segment.termFrequency.get(token) || 0;
            return total + (1 + Math.log(termFrequency)) * inverseDocumentFrequency(token);
          }, 0);
          return {
            segmentId: segment.segmentId,
            text: segment.text,
            offset: segment.offset,
            duration: segment.duration,
            matchCount: matchedTokens.length,
            score,
          };
        })
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score || b.matchCount - a.matchCount || a.segmentId - b.segmentId)
        .slice(0, limit)
        .map(({ score: _score, ...result }) => result);
    },
  };
};
