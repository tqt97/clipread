import type { TranscriptProvider } from './transcript-provider';
import { YouTubeTranscriptProvider } from './youtube-transcript-provider';

const providers: TranscriptProvider[] = [new YouTubeTranscriptProvider()];

export const findTranscriptProvider = (url: string): TranscriptProvider | undefined =>
  providers.find((provider) => provider.supports(url));
