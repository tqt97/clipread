import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  Search,
  StickyNote,
  Subtitles,
  Text,
} from 'lucide-react';
import type { RefObject, ReactNode, UIEvent } from 'react';
import { toMarkdown, toPlainText, toSrt, type TranscriptDocument } from '@/domain/transcript';
import type { TranscriptSearchResult } from '@/domain/insights';
import { normalizeSearchText, toTimestampUrl } from '@/domain/insights';
import type { ViewMode } from './transcript-workbench-types';

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
  onSearchQueryChange: (query: string) => void;
  searchResults: TranscriptSearchResult[];
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

const renderSearchText = (text: string, query: string): ReactNode => {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return text;
  const originalChars = Array.from(text);
  let normalizedText = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let originalOffset = 0;
  originalChars.forEach((character) => {
    const normalized = normalizeSearchText(character);
    const originalEnd = originalOffset + character.length;
    for (let index = 0; index < normalized.length; index += 1) {
      starts.push(originalOffset);
      ends.push(originalEnd);
    }
    normalizedText += normalized;
    originalOffset = originalEnd;
  });
  const ranges: Array<[number, number]> = [];
  let searchFrom = 0;
  while (searchFrom < normalizedText.length) {
    const matchStart = normalizedText.indexOf(normalizedQuery, searchFrom);
    if (matchStart < 0) break;
    const matchEnd = matchStart + normalizedQuery.length - 1;
    ranges.push([starts[matchStart], ends[matchEnd]]);
    searchFrom = matchEnd + 1;
  }
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start < cursor) return;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={`${start}-${end}-${index}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
};

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
  onSearchQueryChange,
  searchResults,
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
  const matchingSegmentIds = new Set(searchResults.map((result) => result.segmentId));
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
        <span>{searchQuery.trim() ? `${searchResults.length} kết quả` : 'Tìm kiếm'}</span>
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
        {viewMode === 'read'
          ? paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)
          : document.segments.map((segment, index) => (
              <div
                className={`caption-row ${activeSegmentId === index ? 'active' : ''}`}
                id={`segment-${index}`}
                key={`${segment.offset}-${segment.text.slice(0, 20)}`}
                ref={(element) => {
                  segmentRefs.current[index] = element;
                }}
              >
                <a
                  href={toTimestampUrl(document.sourceUrl, segment.offset)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onSegmentClick(index)}
                  aria-label={`Mở video tại ${formatTimestamp(segment.offset)}`}
                >
                  {formatTimestamp(segment.offset)} <ExternalLink size={11} />
                </a>
                <span>
                  {matchingSegmentIds.has(index) ? renderSearchText(segment.text, searchQuery) : segment.text}
                </span>
                <div className="caption-tools">
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(index)}
                    aria-label={bookmarkedSegments.includes(index) ? 'Bỏ bookmark' : 'Đánh dấu bookmark'}
                    title={bookmarkedSegments.includes(index) ? 'Bỏ bookmark' : 'Bookmark'}
                  >
                    <span aria-hidden="true">{bookmarkedSegments.includes(index) ? '★' : '☆'}</span>
                  </button>
                  <button type="button" onClick={() => onOpenNote(index)} aria-label="Thêm ghi chú" title="Ghi chú">
                    <StickyNote size={14} />
                  </button>
                </div>
              </div>
            ))}
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
