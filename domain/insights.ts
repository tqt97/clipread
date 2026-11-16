import { cleanSegmentText, detectPlatform, type TranscriptSegment } from './transcript';

export interface TranscriptSearchResult {
  segmentId: number;
  text: string;
  offset: number;
  duration: number;
  matchCount: number;
}

export interface TranscriptKeyword {
  term: string;
  count: number;
  segmentIds: number[];
}

export interface TranscriptHighlight {
  segmentId: number;
  text: string;
  offset: number;
  duration: number;
  score: number;
  keywords: string[];
}

export interface TranscriptInsights {
  keywords: TranscriptKeyword[];
  highlights: TranscriptHighlight[];
}

export interface TranscriptInsightOptions {
  keywordLimit?: number;
  highlightLimit?: number;
}

const DEFAULT_KEYWORD_LIMIT = 8;
const DEFAULT_HIGHLIGHT_LIMIT = 5;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
const fold = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi-VN');

export const normalizeSearchText = fold;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'with',
  'cho', 'của', 'cũng', 'đã', 'đang', 'được', 'để', 'đến', 'đó', 'là', 'một', 'này', 'những',
  'rất', 'sẽ', 'trong', 'và', 'với', 'theo', 'khi', 'không', 'có', 'nên', 'thì', 'từ', 'về',
].map(fold));

const tokenEntriesOf = (value: string): Array<{ key: string; label: string }> => (cleanSegmentText(value).match(TOKEN_PATTERN) || [])
  .map((token) => ({ key: fold(token), label: token }))
  .filter(({ key }) => key.length > 2 && !STOP_WORDS.has(key));

const keywordEntriesOf = (value: string): Array<{ key: string; label: string; words: number }> => {
  const entries = (cleanSegmentText(value).match(TOKEN_PATTERN) || [])
    .map((token) => ({ key: fold(token), label: token }));
  const candidates = entries
    .filter(({ key }) => key.length > 2 && !STOP_WORDS.has(key))
    .map((entry) => ({ ...entry, words: 1 }));
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= entries.length - size; index += 1) {
      const phrase = entries.slice(index, index + size);
      if (phrase.some(({ key }) => key.length <= 2 || STOP_WORDS.has(key))) continue;
      candidates.push({
        key: phrase.map((entry) => entry.key).join(' '),
        label: phrase.map((entry) => entry.label).join(' '),
        words: size,
      });
    }
  }
  return candidates;
};

const countOccurrences = (value: string, query: string): number => {
  const foldedValue = fold(value);
  const foldedQuery = fold(query).trim();
  if (!foldedQuery) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = foldedValue.indexOf(foldedQuery, cursor)) !== -1) {
    count += 1;
    cursor += foldedQuery.length;
  }
  return count;
};

export const searchTranscript = (segments: TranscriptSegment[], query: string): TranscriptSearchResult[] => {
  const foldedQuery = query.trim();
  if (!foldedQuery) return [];

  return segments.flatMap((segment, segmentId) => {
    const text = cleanSegmentText(segment.text);
    const matchCount = countOccurrences(text, foldedQuery);
    return matchCount > 0
      ? [{ segmentId, text, offset: segment.offset, duration: segment.duration, matchCount }]
      : [];
  });
};

const extractKeywords = (segments: TranscriptSegment[], limit: number): TranscriptKeyword[] => {
  const stats = new Map<string, { term: string; count: number; segmentIds: number[]; words: number }>();
  segments.forEach((segment, segmentId) => {
    const seenInSegment = new Set<string>();
    keywordEntriesOf(segment.text).forEach(({ key, label, words }) => {
      const current = stats.get(key) || { term: label, count: 0, segmentIds: [], words };
      current.count += 1;
      if (!seenInSegment.has(key)) {
        current.segmentIds.push(segmentId);
        seenInSegment.add(key);
      }
      stats.set(key, current);
    });
  });

  return [...stats.entries()]
    .sort(([termA, valueA], [termB, valueB]) => (valueB.count * (valueB.words > 1 ? 2 : 1)) - (valueA.count * (valueA.words > 1 ? 2 : 1)) || valueB.segmentIds.length - valueA.segmentIds.length || valueB.words - valueA.words || (termA < termB ? -1 : termA > termB ? 1 : 0))
    .slice(0, Math.max(0, limit))
    .map(([, value]) => ({ term: value.term, count: value.count, segmentIds: [...value.segmentIds] }));
};

const extractHighlights = (segments: TranscriptSegment[], keywords: TranscriptKeyword[], limit: number): TranscriptHighlight[] => {
  const recurringTerms = new Set(keywords.filter((keyword) => keyword.segmentIds.length > 1).map((keyword) => fold(keyword.term)));
  if (recurringTerms.size === 0) return [];
  return segments
    .map((segment, segmentId) => {
      const text = cleanSegmentText(segment.text);
      const foldedText = ` ${fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
      const matchedKeywords = [...recurringTerms].filter((term) => foldedText.includes(` ${term} `));
      const sentenceBonus = /[.!?…]["')\]]?$/.test(text) ? 1 : 0;
      const score = matchedKeywords.length * 100 + text.length + sentenceBonus;
      return {
        segmentId,
        text,
        offset: segment.offset,
        duration: segment.duration,
        score,
        keywords: matchedKeywords,
      };
    })
    .filter((highlight) => highlight.text.length > 0)
    .sort((a, b) => b.score - a.score || a.segmentId - b.segmentId)
    .slice(0, Math.max(0, limit));
};

export const extractTranscriptInsights = (
  segments: TranscriptSegment[],
  options: TranscriptInsightOptions = {},
): TranscriptInsights => {
  const keywords = extractKeywords(segments, options.keywordLimit ?? DEFAULT_KEYWORD_LIMIT);
  return {
    keywords,
    highlights: extractHighlights(segments, keywords, options.highlightLimit ?? DEFAULT_HIGHLIGHT_LIMIT),
  };
};

export const toTimestampUrl = (sourceUrl: string, offset: number): string => {
  if (detectPlatform(sourceUrl) !== 'youtube') return sourceUrl;
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('t', `${Math.max(0, Math.floor(offset))}s`);
    return url.toString();
  } catch {
    return sourceUrl;
  }
};
