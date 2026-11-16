import { NextResponse } from 'next/server';
import { getTranscriptionJob, TranscriptionWorkerError } from '@/services/transcription-worker';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    return NextResponse.json(await getTranscriptionJob(jobId));
  } catch (error) {
    if (error instanceof TranscriptionWorkerError) {
      const status = error.status === 404 ? 404 : error.status === 401 ? 401 : 502;
      return NextResponse.json({ error: error.message, code: error.code || 'WORKER_UNAVAILABLE' }, { status });
    }
    return NextResponse.json({ error: 'Không thể đọc trạng thái job transcription.' }, { status: 502 });
  }
}
