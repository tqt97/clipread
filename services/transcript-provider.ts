import type { TranscriptDocument } from '@/domain/transcript';

export interface TranscriptProvider {
  supports(url: string): boolean;
  getTranscript(url: string, language?: string): Promise<TranscriptDocument>;
}
