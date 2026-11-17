import { detectPlatform, isHttpUrl, type TranscriptDocument } from './transcript';

export interface TranscriptWorkspaceExport {
  schemaVersion: 1;
  document: TranscriptDocument;
  bookmarks: number[];
  notes: Record<string, string>;
}

export const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;

export const parseTranscriptWorkspace = (value: unknown, serializedLength = 0): TranscriptWorkspaceExport => {
  if (serializedLength > MAX_WORKSPACE_BYTES || !value || typeof value !== 'object')
    throw new Error('INVALID_WORKSPACE');
  const candidate = value as Partial<TranscriptWorkspaceExport>;
  const document = candidate.document;
  if (candidate.schemaVersion !== 1 || !document || typeof document !== 'object') throw new Error('INVALID_WORKSPACE');
  const sourcePlatform = detectPlatform(document.sourceUrl);
  if (!isHttpUrl(document.sourceUrl) || sourcePlatform === 'unknown' || document.platform !== sourcePlatform)
    throw new Error('INVALID_WORKSPACE');
  if (typeof document.title !== 'string' || !Array.isArray(document.segments) || document.segments.length > 100_000)
    throw new Error('INVALID_WORKSPACE');
  document.segments.forEach((segment) => {
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !Number.isFinite(segment.offset) ||
      !Number.isFinite(segment.duration)
    )
      throw new Error('INVALID_WORKSPACE');
  });
  const bookmarks = Array.isArray(candidate.bookmarks)
    ? candidate.bookmarks.filter((id): id is number => Number.isInteger(id) && id >= 0 && id < document.segments.length)
    : [];
  const notes = candidate.notes && typeof candidate.notes === 'object' ? candidate.notes : {};
  if (
    Object.entries(notes).some(
      ([segmentId, note]) =>
        !/^\d+$/.test(segmentId) ||
        Number(segmentId) >= document.segments.length ||
        typeof note !== 'string' ||
        note.length > 10_000,
    )
  )
    throw new Error('INVALID_WORKSPACE');
  return { schemaVersion: 1, document, bookmarks, notes: notes as Record<string, string> };
};
