export type TranscriptApiErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'PROVIDER_NOT_READY'
  | 'TRANSCRIPT_NOT_FOUND'
  | 'UPSTREAM_ERROR';

export interface TranscriptApiError {
  error: string;
  code: TranscriptApiErrorCode;
}

export const apiError = (
  code: TranscriptApiErrorCode,
  error: string,
): TranscriptApiError => ({ code, error });
