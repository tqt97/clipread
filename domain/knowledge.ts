import { cleanSegmentText, type TranscriptSegment } from './transcript';
import { normalizeSearchText, type TranscriptKeyword } from './insights';

export interface TranscriptChapter {
  index: number;
  title: string;
  segmentIds: number[];
  offset: number;
  duration: number;
}

export interface TranscriptSummaryItem {
  text: string;
  segmentId: number;
  offset: number;
}

export interface TranscriptActionItem {
  text: string;
  segmentId: number;
  offset: number;
}

export interface TranscriptAnswer {
  confidence: 'high' | 'medium' | 'low';
  results: Array<{ text: string; segmentId: number; offset: number; score: number }>;
}

const STOPWORDS = new Set([
  'and', 'are', 'but', 'for', 'from', 'into', 'that', 'the', 'this', 'with',
  'cho', 'các', 'của', 'đã', 'đang', 'được', 'là', 'một', 'những', 'này', 'trong', 'và', 'với',
]);

const tokens = (value: string): string[] => normalizeSearchText(value)
  .split(/[^\p{L}\p{N}]+/u)
  .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const titleFromText = (text: string, index: number): string => {
  const clean = cleanSegmentText(text);
  const words = clean.split(/\s+/).slice(0, 9).join(' ');
  return words ? `${words}${clean.split(/\s+/).length > 9 ? '…' : ''}` : `Chương ${index}`;
};

export const buildTranscriptChapters = (
  segments: TranscriptSegment[],
  options: { gapSeconds?: number; maxSegments?: number } = {},
): TranscriptChapter[] => {
  const gapSeconds = options.gapSeconds ?? 45;
  const maxSegments = options.maxSegments ?? 10;
  const chapters: TranscriptChapter[] = [];
  let current: number[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = segments[current[0]];
    const last = segments[current[current.length - 1]];
    chapters.push({
      index: chapters.length + 1,
      title: titleFromText(first.text, chapters.length + 1),
      segmentIds: [...current],
      offset: first.offset,
      duration: Math.max(0, last.offset + last.duration - first.offset),
    });
    current = [];
  };

  segments.forEach((segment, segmentId) => {
    const previous = current.length > 0 ? segments[current[current.length - 1]] : null;
    if (previous && (segment.offset - (previous.offset + previous.duration) >= gapSeconds || current.length >= maxSegments)) flush();
    current.push(segmentId);
  });
  flush();
  return chapters;
};

export const extractiveSummary = (
  segments: TranscriptSegment[],
  keywords: TranscriptKeyword[],
  limit = 5,
): TranscriptSummaryItem[] => {
  const keywordWeights = new Map(keywords.map((keyword) => [normalizeSearchText(keyword.term), keyword.count]));
  return segments
    .map((segment, segmentId) => {
      const text = cleanSegmentText(segment.text);
      const keywordScore = tokens(text).reduce((total, token) => total + (keywordWeights.get(token) ?? 0), 0);
      const score = keywordScore > 0
        ? keywordScore + (segmentId === 0 ? 0.5 : 0) + (/[.!?…]$/.test(text) ? 0.25 : 0)
        : 0;
      return { text, segmentId, offset: segment.offset, score };
    })
    .filter((item) => item.text && item.score > 0)
    .sort((a, b) => b.score - a.score || a.segmentId - b.segmentId)
    .slice(0, limit)
    .sort((a, b) => a.segmentId - b.segmentId)
    .map(({ text, segmentId, offset }) => ({ text, segmentId, offset }));
};

const ACTION_PATTERN = /\b(need to|should|must|todo|action item|implement|fix|review|create|send|check|cần|nên|phải|hãy|thực hiện|triển khai|kiểm tra|xem xét|tạo|gửi)\b/i;

export const extractActionItems = (segments: TranscriptSegment[], limit = 8): TranscriptActionItem[] => segments
  .map((segment, segmentId) => ({ text: cleanSegmentText(segment.text), segmentId, offset: segment.offset }))
  .filter((item) => ACTION_PATTERN.test(item.text))
  .slice(0, limit);

export const answerTranscriptQuestion = (segments: TranscriptSegment[], question: string, limit = 3): TranscriptAnswer => {
  const queryTokens = new Set(tokens(question));
  if (queryTokens.size === 0) return { confidence: 'low', results: [] };
  const results = segments
    .map((segment, segmentId) => {
      const text = cleanSegmentText(segment.text);
      const matched = tokens(text).filter((token) => queryTokens.has(token));
      return { text, segmentId, offset: segment.offset, score: matched.length };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.segmentId - b.segmentId)
    .slice(0, limit);
  const confidence = results.length > 0 && results[0].score >= Math.max(2, queryTokens.size / 2) ? 'high' : results.length > 0 ? 'medium' : 'low';
  return { confidence, results };
};
