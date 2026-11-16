import { NextResponse } from 'next/server';
import { apiError } from '@/domain/api';
import { detectPlatform, isHttpUrl } from '@/domain/transcript';
import { findTranscriptProvider } from '@/services/transcript-providers';
import { YouTubeProviderError } from '@/services/youtube-transcript-provider';
import { isTranscriptionWorkerConfigured, submitTranscriptionJob, TranscriptionWorkerError } from '@/services/transcription-worker';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { url?: unknown; language?: unknown };
  let url = '';
  let language: string | undefined;

  try {
    body = await request.json() as { url?: unknown; language?: unknown };
  } catch {
    return NextResponse.json(apiError('INVALID_REQUEST', 'Body request phải là JSON hợp lệ.'), { status: 400 });
  }

  try {
    url = typeof body.url === 'string' ? body.url.trim() : '';
    language = typeof body.language === 'string' ? body.language : undefined;

    if (!url || url.length > 2048 || !isHttpUrl(url)) {
      return NextResponse.json(apiError('INVALID_URL', 'URL phải là địa chỉ HTTP hoặc HTTPS hợp lệ.'), { status: 400 });
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      return NextResponse.json(apiError('UNSUPPORTED_PLATFORM', 'Chưa nhận diện được nền tảng từ URL này.'), { status: 422 });
    }

    if (platform !== 'youtube' && isTranscriptionWorkerConfigured()) {
      const job = await submitTranscriptionJob(url, language);
      return NextResponse.json(job, { status: 202 });
    }

    const provider = findTranscriptProvider(url);
    if (!provider) {
      const platformName = platform === 'tiktok' ? 'TikTok' : 'Facebook';
      return NextResponse.json(apiError('PROVIDER_NOT_READY', `${platformName} đã được nhận diện nhưng provider transcript chưa được bật trong MVP.`), { status: 422 });
    }

    const document = await provider.getTranscript(url, language);
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof TranscriptionWorkerError) {
      return NextResponse.json(apiError(error.status === 401 ? 'WORKER_UNAUTHORIZED' : 'WORKER_UNAVAILABLE', error.status === 401
        ? 'Worker transcription từ chối xác thực. Hãy kiểm tra token cấu hình.'
        : 'Worker transcription hiện không khả dụng.'), { status: error.status === 401 ? 502 : 503 });
    }
    if (error instanceof YouTubeProviderError && (error.code === 'NO_TRANSCRIPT' || error.code === 'YOUTUBE_RATE_LIMITED')) {
      if (isTranscriptionWorkerConfigured()) {
        try {
          const job = await submitTranscriptionJob(url, language);
          return NextResponse.json(job, { status: 202 });
        } catch {
          return NextResponse.json(apiError('WORKER_UNAVAILABLE', 'Không thể khởi động worker transcription lúc này.'), { status: 502 });
        }
      }

      if (error.code === 'YOUTUBE_RATE_LIMITED') {
        return NextResponse.json(apiError('YOUTUBE_RATE_LIMITED', 'YouTube đang giới hạn request từ Vercel. Cấu hình worker remote để lấy transcript từ máy chủ riêng.'), { status: 503 });
      }
      return NextResponse.json(apiError('TRANSCRIPT_NOT_FOUND', 'Video này không có caption/subtitle khả dụng. MVP chưa chạy speech-to-text từ audio.'), { status: 422 });
    }

    if (error instanceof YouTubeProviderError && error.code === 'VIDEO_UNAVAILABLE') {
      return NextResponse.json(apiError('VIDEO_UNAVAILABLE', 'Video YouTube không khả dụng hoặc đã bị gỡ.'), { status: 502 });
    }

    if (error instanceof YouTubeProviderError && error.code === 'INVALID_LANGUAGE') {
      return NextResponse.json(apiError('INVALID_LANGUAGE', 'Ngôn ngữ transcript không hợp lệ.'), { status: 400 });
    }

    return NextResponse.json(apiError('UPSTREAM_ERROR', 'Không thể lấy transcript lúc này. YouTube có thể đã thay đổi hoặc đang giới hạn request.'), { status: 502 });
  }
}
