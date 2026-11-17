import { Clock3, Trash2 } from 'lucide-react';
import type { LibraryEntry } from './hooks/useTranscriptLibrary';

export const TranscriptLibraryPanel = ({
  entries,
  onOpen,
  onRemove,
}: {
  entries: LibraryEntry[];
  onOpen: (entry: LibraryEntry) => void;
  onRemove: (id: string) => void;
}) => {
  if (!entries.length) return null;
  return (
    <section className="library-panel" aria-labelledby="library-title">
      <div className="library-heading">
        <strong id="library-title">
          <Clock3 size={15} /> Đọc gần đây
        </strong>
        <small>Lưu trên thiết bị</small>
      </div>
      {entries.map((entry) => (
        <div className="library-item" key={entry.id}>
          <button type="button" onClick={() => onOpen(entry)}>
            {entry.title}
          </button>
          <span>{entry.platform}</span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Xóa ${entry.title}`}
            onClick={() => onRemove(entry.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </section>
  );
};
