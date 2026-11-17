import { useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, StickyNote } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import type { TranscriptSearchResult } from '@/domain/insights';
import { normalizeSearchText, toTimestampUrl } from '@/domain/insights';
import type { TranscriptSegment } from '@/domain/transcript';

interface TranscriptCaptionListProps {
  segments: TranscriptSegment[];
  sourceUrl: string;
  searchHighlightQuery: string;
  searchResults: TranscriptSearchResult[];
  scrollElementRef: RefObject<HTMLDivElement | null>;
  activeSegmentId: number | null;
  segmentRefs: RefObject<Record<number, HTMLDivElement | null>>;
  bookmarkedSegments: number[];
  onToggleBookmark: (segmentId: number) => void;
  onOpenNote: (segmentId: number) => void;
  onSegmentClick: (segmentId: number) => void;
}

const formatTimestamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const renderSearchText = (text: string, query: string) => {
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

export const TranscriptCaptionList = ({
  segments,
  sourceUrl,
  searchHighlightQuery,
  searchResults,
  scrollElementRef,
  activeSegmentId,
  segmentRefs,
  bookmarkedSegments,
  onToggleBookmark,
  onOpenNote,
  onSegmentClick,
}: TranscriptCaptionListProps) => {
  const matchingSegmentIds = new Set(searchResults.map((result) => result.segmentId));
  // TanStack Virtual manages its own measured state and cannot be memoized by React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 58,
    overscan: 12,
    getItemKey: (index) => `${segments[index].offset}-${segments[index].text.slice(0, 20)}`,
  });

  useEffect(() => {
    if (activeSegmentId !== null) virtualizer.scrollToIndex(activeSegmentId, { align: 'center' });
  }, [activeSegmentId, virtualizer]);

  return (
    <div className="virtual-caption-list" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const index = virtualItem.index;
        const segment = segments[index];
        const isBookmarked = bookmarkedSegments.includes(index);
        return (
          <div
            className={`caption-row ${activeSegmentId === index ? 'active' : ''}`}
            id={`segment-${index}`}
            key={virtualItem.key}
            data-index={index}
            ref={(element) => {
              virtualizer.measureElement(element);
              segmentRefs.current[index] = element;
            }}
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <a
              href={toTimestampUrl(sourceUrl, segment.offset)}
              target="_blank"
              rel="noreferrer"
              onClick={() => onSegmentClick(index)}
              aria-label={`Mở video tại ${formatTimestamp(segment.offset)}`}
            >
              {formatTimestamp(segment.offset)} <ExternalLink size={11} />
            </a>
            <span>
              {matchingSegmentIds.has(index) ? renderSearchText(segment.text, searchHighlightQuery) : segment.text}
            </span>
            <div className="caption-tools">
              <button
                type="button"
                onClick={() => onToggleBookmark(index)}
                aria-label={isBookmarked ? 'Bỏ bookmark' : 'Đánh dấu bookmark'}
                title={isBookmarked ? 'Bỏ bookmark' : 'Bookmark'}
              >
                <span aria-hidden="true">{isBookmarked ? '★' : '☆'}</span>
              </button>
              <button type="button" onClick={() => onOpenNote(index)} aria-label="Thêm ghi chú" title="Ghi chú">
                <StickyNote size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
