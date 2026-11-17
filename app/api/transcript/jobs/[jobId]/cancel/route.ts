import { NextResponse } from 'next/server';
import { apiError } from '@/domain/api';
import { cancelTranscriptionJob, TranscriptionWorkerError } from '@/services/transcription-worker';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    return NextResponse.json(await cancelTranscriptionJob(jobId));
  } catch (error) {
    if (error instanceof TranscriptionWorkerError) {
      return NextResponse.json(apiError(error.status === 404 ? 'JOB_NOT_FOUND' : 'WORKER_UNAVAILABLE', error.message), {
        status: error.status === 404 ? 404 : 502,
      });
    }
    return NextResponse.json(apiError('WORKER_UNAVAILABLE', 'Không thể gửi yêu cầu dừng tới worker.'), { status: 502 });
  }
}
