export type SourcePlatform = 'youtube' | 'tiktok' | 'facebook' | 'unknown';

export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

export interface TranscriptDocument {
  sourceUrl: string;
  platform: SourcePlatform;
  title: string;
  author?: string;
  durationSeconds?: number;
  language?: string;
  thumbnail?: string;
  segments: TranscriptSegment[];
}

export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const detectPlatform = (value: string): SourcePlatform => {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') return 'facebook';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

const decodeEntities = (value: string): string => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

export const cleanSegmentText = (value: string): string => decodeEntities(value)
  .replace(/\s+/g, ' ')
  .trim();

export const toReadableParagraphs = (segments: TranscriptSegment[]): string[] => {
  const lines = segments
    .map((segment) => cleanSegmentText(segment.text))
    .filter(Boolean);

  const paragraphs: string[] = [];
  let current: string[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length === 0) return;
    paragraphs.push(current.join(' '));
    current = [];
    chars = 0;
  };

  for (const line of lines) {
    current.push(line);
    chars += line.length + 1;
    const sentenceEnd = /[.!?…]["')\]]?$/.test(line);
    if ((chars >= 360 && sentenceEnd) || chars >= 620) flush();
  }

  flush();
  return paragraphs;
};

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

const formatSrtTime = (seconds: number): string => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
};

export const toSrt = (segments: TranscriptSegment[]): string => segments
  .map((segment, index) => {
    const start = segment.offset;
    const end = segment.offset + segment.duration;
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${cleanSegmentText(segment.text)}`;
  })
  .join('\n\n');

export const toMarkdown = (document: TranscriptDocument): string => {
  const paragraphs = toReadableParagraphs(document.segments);
  const meta = [
    `# ${document.title}`,
    '',
    `> Source: ${document.sourceUrl}`,
    document.author ? `> Author: ${document.author}` : null,
    document.language ? `> Language: ${document.language}` : null,
    '',
    '## Transcript',
    '',
  ].filter((line): line is string => line !== null);

  return [...meta, ...paragraphs.flatMap((paragraph) => [paragraph, ''])].join('\n').trimEnd();
};

export const toPlainText = (document: TranscriptDocument): string =>
  toReadableParagraphs(document.segments).join('\n\n');
