import { Check, ChevronLeft, ChevronRight, Clipboard, Download, FileText, Search, Subtitles, Text } from 'lucide-react';
import type { RefObject, UIEvent } from 'react';
import { toMarkdown, toPlainText, toSrt, type TranscriptDocument } from '@/domain/transcript';
import type { TranscriptSearchResult } from '@/domain/insights';
import type { ViewMode } from './transcript-workbench-types';
import { TranscriptCaptionList } from './TranscriptCaptionList';

interface TranscriptReaderProps {
  document: TranscriptDocument;
  paragraphs: string[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  readingProgress: number;
  base: string;
  copied: boolean;
  onCopy: () => void;
  onDownload: (content: string, filename: string, mime: string) => void;
  searchQuery: string;
  searchHighlightQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: TranscriptSearchResult[];
  semanticSearch: boolean;
  searchMode: 'exact' | 'related';
  onSearchModeChange: (mode: 'exact' | 'related') => void;
  onMoveSearch: (direction: 1 | -1) => void;
  readerBodyRef: RefObject<HTMLDivElement | null>;
  onReaderScroll: (event: UIEvent<HTMLDivElement>) => void;
  activeSegmentId: number | null;
  segmentRefs: RefObject<Record<number, HTMLDivElement | null>>;
  bookmarkedSegments: number[];
  notes: Record<number, string>;
  noteDraft: string;
  onToggleBookmark: (segmentId: number) => void;
  onOpenNote: (segmentId: number) => void;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: (segmentId: number) => void;
  onSegmentClick: (segmentId: number) => void;
}

export const TranscriptReader = ({
  document,
  paragraphs,
  viewMode,
  onViewModeChange,
  readingProgress,
  base,
  copied,
  onCopy,
  onDownload,
  searchQuery,
  searchHighlightQuery,
  onSearchQueryChange,
  searchResults,
  semanticSearch,
  searchMode,
  onSearchModeChange,
  onMoveSearch,
  readerBodyRef,
  onReaderScroll,
  activeSegmentId,
  segmentRefs,
  bookmarkedSegments,
  notes,
  noteDraft,
  onToggleBookmark,
  onOpenNote,
  onNoteDraftChange,
  onSaveNote,
  onSegmentClick,
}: TranscriptReaderProps) => {
  const formatTimestamp = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  return (
    <article className="reader-card">
      <div
        className="reading-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readingProgress}
        aria-label={`Đã đọc ${readingProgress}%`}
      >
        <span style={{ width: `${readingProgress}%` }} />
      </div>
      <div className="reader-toolbar">
        <div className="view-switch">
          <button
            type="button"
            className={viewMode === 'read' ? 'active' : ''}
            onClick={() => onViewModeChange('read')}
          >
            <Text size={15} /> Bài đọc
          </button>
          <button type="button" className={viewMode === 'raw' ? 'active' : ''} onClick={() => onViewModeChange('raw')}>
            <Subtitles size={15} /> Caption gốc
          </button>
        </div>
        <span className="reading-progress-label">Đã đọc {readingProgress}%</span>
        <div className="export-actions">
          <button type="button" onClick={onCopy}>
            {copied ? <Check size={15} /> : <Clipboard size={15} />} {copied ? 'Đã copy' : 'Copy'}
          </button>
          <details className="export-menu">
            <summary>
              <Download size={15} /> Xuất
            </summary>
            <div>
              <button type="button" onClick={() => onDownload(toMarkdown(document), `${base}.md`, 'text/markdown')}>
                <FileText size={15} /> Markdown
              </button>
              <button type="button" onClick={() => onDownload(toPlainText(document), `${base}.txt`, 'text/plain')}>
                <Download size={15} /> Văn bản
              </button>
              <button
                type="button"
                onClick={() => onDownload(toSrt(document.segments), `${base}.srt`, 'application/x-subrip')}
              >
                <Download size={15} /> Phụ đề
              </button>
            </div>
          </details>
        </div>
      </div>
      <div className="transcript-search" role="search">
        <Search size={16} aria-hidden="true" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onMoveSearch(event.shiftKey ? -1 : 1);
          }}
          placeholder="Tìm trong transcript..."
          aria-label="Tìm trong transcript"
        />
        <span>
          {searchQuery.trim()
            ? `${searchResults.length} ${semanticSearch ? 'gợi ý theo nội dung' : 'kết quả'}`
            : 'Tìm kiếm'}
        </span>
        <select
          value={searchMode}
          onChange={(event) => onSearchModeChange(event.target.value as 'exact' | 'related')}
          aria-label="Chế độ tìm kiếm"
        >
          <option value="exact">Khớp chính xác</option>
          <option value="related">Gợi ý liên quan</option>
        </select>
        <button
          type="button"
          onClick={() => onMoveSearch(-1)}
          disabled={searchResults.length === 0}
          aria-label="Kết quả trước"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={() => onMoveSearch(1)}
          disabled={searchResults.length === 0}
          aria-label="Kết quả tiếp theo"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="reader-body" ref={readerBodyRef} onScroll={onReaderScroll}>
        {viewMode === 'read' ? (
          paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)
        ) : (
          <TranscriptCaptionList
            segments={document.segments}
            sourceUrl={document.sourceUrl}
            searchHighlightQuery={searchHighlightQuery}
            searchResults={searchResults}
            scrollElementRef={readerBodyRef}
            activeSegmentId={activeSegmentId}
            segmentRefs={segmentRefs}
            bookmarkedSegments={bookmarkedSegments}
            onToggleBookmark={onToggleBookmark}
            onOpenNote={onOpenNote}
            onSegmentClick={onSegmentClick}
          />
        )}
      </div>
      {viewMode === 'raw' && activeSegmentId !== null && (
        <div className="note-editor">
          <label htmlFor="segment-note">
            Ghi chú cho đoạn {formatTimestamp(document.segments[activeSegmentId]?.offset ?? 0)}
          </label>
          <div>
            <input
              id="segment-note"
              value={noteDraft}
              onChange={(event) => onNoteDraftChange(event.target.value)}
              placeholder="Viết ghi chú riêng của bạn..."
            />
            <button type="button" onClick={() => onSaveNote(activeSegmentId)}>
              Lưu ghi chú
            </button>
          </div>
          {notes[activeSegmentId] && <small>Đã có ghi chú cho đoạn này.</small>}
        </div>
      )}
    </article>
  );
};
