import {
  fetchTranscript,
  InMemoryCache,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptInvalidLangError,
  YoutubeTranscriptInvalidVideoIdError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type TranscriptResult,
} from 'youtube-transcript-plus';
import { cleanSegmentText, detectPlatform, type TranscriptDocument } from '@/domain/transcript';
import type { TranscriptProvider } from './transcript-provider';

export type YouTubeProviderErrorCode =
  | 'NO_TRANSCRIPT'
  | 'YOUTUBE_RATE_LIMITED'
  | 'VIDEO_UNAVAILABLE'
  | 'INVALID_LANGUAGE'
  | 'INVALID_URL';

export class YouTubeProviderError extends Error {
  constructor(public readonly code: YouTubeProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const transcriptCache = new InMemoryCache(15 * 60 * 1000);

export class YouTubeTranscriptProvider implements TranscriptProvider {
  supports(url: string): boolean {
    return detectPlatform(url) === 'youtube';
  }

  async getTranscript(url: string, language?: string): Promise<TranscriptDocument> {
    let result: TranscriptResult;
    try {
      result = await fetchTranscript(url, {
        ...(language && language !== 'auto' ? { lang: language } : {}),
        cache: transcriptCache,
        cacheTTL: 15 * 60 * 1000,
        retries: 0,
        videoDetails: true,
      }) as TranscriptResult;
    } catch (error) {
      if (error instanceof YoutubeTranscriptTooManyRequestError) {
        throw new YouTubeProviderError(
          'YOUTUBE_RATE_LIMITED',
          'YouTube đang giới hạn request từ máy chủ Vercel.',
          { cause: error },
        );
      }
      if (
        error instanceof YoutubeTranscriptNotAvailableError
        || error instanceof YoutubeTranscriptNotAvailableLanguageError
        || error instanceof YoutubeTranscriptDisabledError
      ) {
        throw new YouTubeProviderError('NO_TRANSCRIPT', 'Video không có caption khả dụng.', { cause: error });
      }
      if (error instanceof YoutubeTranscriptVideoUnavailableError) {
        throw new YouTubeProviderError('VIDEO_UNAVAILABLE', 'Video YouTube không khả dụng hoặc đã bị gỡ.', { cause: error });
      }
      if (error instanceof YoutubeTranscriptInvalidLangError) {
        throw new YouTubeProviderError('INVALID_LANGUAGE', 'Ngôn ngữ transcript không hợp lệ.', { cause: error });
      }
      if (error instanceof YoutubeTranscriptInvalidVideoIdError) {
        throw new YouTubeProviderError('INVALID_URL', 'URL YouTube không hợp lệ.', { cause: error });
      }
      throw error;
    }

    const segments = result.segments
      .map((segment) => ({
        text: cleanSegmentText(segment.text),
        duration: segment.duration,
        offset: segment.offset,
        lang: segment.lang,
      }))
      .filter((segment) => segment.text.length > 0);

    if (segments.length === 0) {
      throw new YouTubeProviderError('NO_TRANSCRIPT', 'Video không có caption khả dụng.');
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
