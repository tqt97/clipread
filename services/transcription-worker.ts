import type { TranscriptionJobResponse } from '@/domain/transcription-job';

const workerUrl = process.env.TRANSCRIPTION_WORKER_URL?.replace(/\/$/, '');
const workerToken = process.env.TRANSCRIPTION_WORKER_TOKEN;

export class TranscriptionWorkerError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
  }
}

const requestSignal = (signal?: AbortSignal): AbortSignal => signal
  ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  : AbortSignal.timeout(10_000);

const workerHeaders = (): HeadersInit => ({
  ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
});

export const isTranscriptionWorkerConfigured = (): boolean => Boolean(workerUrl);

export const submitTranscriptionJob = async (url: string, language?: string, signal?: AbortSignal): Promise<TranscriptionJobResponse> => {
  if (!workerUrl) throw new Error('TRANSCRIPTION_WORKER_NOT_CONFIGURED');

  const response = await fetch(`${workerUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...workerHeaders() },
    body: JSON.stringify({ url, language: language || 'auto' }),
    signal: requestSignal(signal),
  });

  if (!response.ok) throw new TranscriptionWorkerError(response.status, 'Worker không nhận được job.', response.status === 401 ? 'UNAUTHORIZED' : undefined);
  return response.json() as Promise<TranscriptionJobResponse>;
};

export const getTranscriptionJob = async (jobId: string, signal?: AbortSignal): Promise<TranscriptionJobResponse> => {
  if (!workerUrl) throw new Error('TRANSCRIPTION_WORKER_NOT_CONFIGURED');

  const response = await fetch(`${workerUrl}/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    headers: workerHeaders(),
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new TranscriptionWorkerError(response.status, payload.error || 'Không thể đọc trạng thái worker.', payload.code);
  }
  return response.json() as Promise<TranscriptionJobResponse>;
};
