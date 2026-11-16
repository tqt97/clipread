import { NextResponse } from 'next/server';
import { apiError } from '@/domain/api';
import { getTranscriptionJob, TranscriptionWorkerError } from '@/services/transcription-worker';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    return NextResponse.json(await getTranscriptionJob(jobId));
  } catch (error) {
    if (error instanceof TranscriptionWorkerError) {
      const status = error.status === 404 ? 404 : error.status === 401 ? 401 : 502;
      const code = error.status === 401 ? 'WORKER_UNAUTHORIZED' : error.status === 404 ? 'JOB_NOT_FOUND' : 'WORKER_UNAVAILABLE';
      return NextResponse.json(apiError(code, error.message), { status });
    }
    return NextResponse.json(apiError('WORKER_UNAVAILABLE', 'Không thể đọc trạng thái job transcription.'), { status: 502 });
  }
}
