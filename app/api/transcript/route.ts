import { NextResponse } from 'next/server';
import { apiError } from '@/domain/api';
import { detectPlatform, isHttpUrl } from '@/domain/transcript';
import { findTranscriptProvider } from '@/services/transcript-providers';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { url?: unknown; language?: unknown };

  try {
    body = await request.json() as { url?: unknown; language?: unknown };
  } catch {
    return NextResponse.json(apiError('INVALID_REQUEST', 'Body request phải là JSON hợp lệ.'), { status: 400 });
  }

  try {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const language = typeof body.language === 'string' ? body.language : undefined;

    if (!url || url.length > 2048 || !isHttpUrl(url)) {
      return NextResponse.json(apiError('INVALID_URL', 'URL phải là địa chỉ HTTP hoặc HTTPS hợp lệ.'), { status: 400 });
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      return NextResponse.json(apiError('UNSUPPORTED_PLATFORM', 'Chưa nhận diện được nền tảng từ URL này.'), { status: 422 });
    }

    const provider = findTranscriptProvider(url);
    if (!provider) {
      const platformName = platform === 'tiktok' ? 'TikTok' : 'Facebook';
      return NextResponse.json(apiError('PROVIDER_NOT_READY', `${platformName} đã được nhận diện nhưng provider transcript chưa được bật trong MVP.`), { status: 422 });
    }

    const document = await provider.getTranscript(url, language);
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NO_TRANSCRIPT|transcript|caption/i.test(message)) {
      return NextResponse.json(apiError('TRANSCRIPT_NOT_FOUND', 'Video này không có caption/subtitle khả dụng. MVP chưa chạy speech-to-text từ audio.'), { status: 422 });
    }

    return NextResponse.json(apiError('UPSTREAM_ERROR', 'Không thể lấy transcript lúc này. YouTube có thể đã thay đổi hoặc đang giới hạn request.'), { status: 502 });
  }
}
