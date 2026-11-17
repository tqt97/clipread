import { Bookmark, StickyNote, Trash2 } from 'lucide-react';
import type { TranscriptDocument } from '@/domain/transcript';

interface TranscriptSavedPanelProps {
  document: TranscriptDocument;
  bookmarkedSegments: number[];
  notes: Record<number, string>;
  onSegmentClick: (segmentId: number) => void;
  onToggleBookmark: (segmentId: number) => void;
  onRemoveNote: (segmentId: number) => void;
}

const preview = (value: string): string => (value.length > 92 ? `${value.slice(0, 89)}…` : value);

export const TranscriptSavedPanel = ({
  document,
  bookmarkedSegments,
  notes,
  onSegmentClick,
  onToggleBookmark,
  onRemoveNote,
}: TranscriptSavedPanelProps) => {
  const noteEntries = Object.entries(notes)
    .map(([segmentId, text]) => ({ segmentId: Number(segmentId), text }))
    .filter(({ segmentId, text }) => Number.isInteger(segmentId) && Boolean(text));

  return (
    <section className="saved-panel" aria-label="Bookmark và ghi chú">
      <div className="saved-heading">
        <strong>Đã lưu</strong>
        <span>{bookmarkedSegments.length + noteEntries.length}</span>
      </div>
      <details open={bookmarkedSegments.length > 0}>
        <summary>
          <Bookmark size={14} /> Bookmark ({bookmarkedSegments.length})
        </summary>
        {bookmarkedSegments.length > 0 ? (
          <ul>
            {bookmarkedSegments.map((segmentId) => {
              const segment = document.segments[segmentId];
              if (!segment) return null;
              return (
                <li key={segmentId}>
                  <button type="button" onClick={() => onSegmentClick(segmentId)}>
                    <time>
                      {Math.floor(segment.offset / 60)}:{String(Math.floor(segment.offset % 60)).padStart(2, '0')}
                    </time>
                    <span>{preview(segment.text)}</span>
                  </button>
                  <button
                    type="button"
                    className="saved-remove"
                    onClick={() => onToggleBookmark(segmentId)}
                    aria-label="Bỏ bookmark"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-item">Chưa có bookmark.</p>
        )}
      </details>
      <details open={noteEntries.length > 0}>
        <summary>
          <StickyNote size={14} /> Ghi chú ({noteEntries.length})
        </summary>
        {noteEntries.length > 0 ? (
          <ul>
            {noteEntries.map(({ segmentId, text }) => {
              const segment = document.segments[segmentId];
              if (!segment) return null;
              return (
                <li key={segmentId}>
                  <button type="button" onClick={() => onSegmentClick(segmentId)}>
                    <time>
                      {Math.floor(segment.offset / 60)}:{String(Math.floor(segment.offset % 60)).padStart(2, '0')}
                    </time>
                    <span>{preview(text)}</span>
                  </button>
                  <button
                    type="button"
                    className="saved-remove"
                    onClick={() => onRemoveNote(segmentId)}
                    aria-label="Xóa ghi chú"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted-item">Chưa có ghi chú.</p>
        )}
      </details>
    </section>
  );
};
