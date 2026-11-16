import { fetchTranscript, type TranscriptResult } from 'youtube-transcript-plus';
import { cleanSegmentText, detectPlatform, type TranscriptDocument } from '@/domain/transcript';
import type { TranscriptProvider } from './transcript-provider';

export class YouTubeTranscriptProvider implements TranscriptProvider {
  supports(url: string): boolean {
    return detectPlatform(url) === 'youtube';
  }

  async getTranscript(url: string, language?: string): Promise<TranscriptDocument> {
    const result = await fetchTranscript(url, {
      ...(language && language !== 'auto' ? { lang: language } : {}),
      retries: 2,
      retryDelay: 700,
      videoDetails: true,
    }) as TranscriptResult;

    const segments = result.segments
      .map((segment) => ({
        text: cleanSegmentText(segment.text),
        duration: segment.duration,
        offset: segment.offset,
        lang: segment.lang,
      }))
      .filter((segment) => segment.text.length > 0);

    if (segments.length === 0) {
      throw new Error('NO_TRANSCRIPT');
    }

    return {
      sourceUrl: url,
      platform: 'youtube',
      title: result.videoDetails.title || 'Untitled video',
      author: result.videoDetails.author,
      durationSeconds: Number(result.videoDetails.lengthSeconds) || undefined,
      language: segments[0]?.lang,
      thumbnail: result.videoDetails.thumbnails?.at(-1)?.url,
      segments,
    };
  }
}
