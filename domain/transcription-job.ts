import type { TranscriptDocument } from './transcript';

export type TranscriptionJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type TranscriptionJobStage =
  | 'queued'
  | 'fetching_metadata'
  | 'checking_captions'
  | 'downloading_audio'
  | 'transcribing'
  | 'finalizing'
  | 'completed';

const transcriptionJobStages: readonly TranscriptionJobStage[] = [
  'queued', 'fetching_metadata', 'checking_captions', 'downloading_audio',
  'transcribing', 'finalizing', 'completed',
];

export const normalizeTranscriptionJobStage = (
  value: unknown,
  fallback: TranscriptionJobStage = 'queued',
): TranscriptionJobStage => transcriptionJobStages.includes(value as TranscriptionJobStage)
  ? value as TranscriptionJobStage
  : fallback;

export interface TranscriptionJobResponse {
  jobId: string;
  status: TranscriptionJobStatus;
  stage?: TranscriptionJobStage;
  document?: TranscriptDocument;
  error?: string;
  code?: string;
}
