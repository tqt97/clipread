type Bucket = { events: number[] };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.TRANSCRIPT_API_RATE_LIMIT || 20);

export const allowTranscriptRequest = (key: string, now = Date.now()): boolean => {
  const bucket = buckets.get(key) || { events: [] };
  bucket.events = bucket.events.filter((event) => now - event < WINDOW_MS);
  if (bucket.events.length >= LIMIT) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.events.push(now);
  buckets.set(key, bucket);
  return true;
};

export const requestClientKey = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous';
