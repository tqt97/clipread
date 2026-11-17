'use client';

import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { BookOpenText, Link2, LoaderCircle, Sparkles, Subtitles } from 'lucide-react';
import { detectPlatform, toPlainText, toReadableParagraphs } from '@/domain/transcript';
import { extractTranscriptInsights } from '@/domain/insights';
import {
  answerTranscriptQuestion,
  buildTranscriptChapters,
  extractActionItems,
  extractiveSummary,
} from '@/domain/knowledge';
import { TranscriptFeedback } from './TranscriptFeedback';
import { TranscriptKnowledgeCard } from './TranscriptKnowledgeCard';
import { TranscriptReader } from './TranscriptReader';
import { TranscriptSavedPanel } from './TranscriptSavedPanel';
import { useClipboard } from './hooks/useClipboard';
import { progressStages, useTranscriptExtraction } from './hooks/useTranscriptExtraction';
import type { ViewMode } from './transcript-workbench-types';
import { useTranscriptLibrary } from './hooks/useTranscriptLibrary';
import { useTranscriptSearch } from './hooks/useTranscriptSearch';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { TranscriptLibraryPanel } from './TranscriptLibraryPanel';
import { TranscriptWorkspaceActions } from './TranscriptWorkspaceActions';
import { parseTranscriptWorkspace } from '@/domain/workspace';

const downloadText = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const slug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'clipread-transcript';

const formatTimestamp = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const TranscriptWorkbench = () => {
  const [hydrated, setHydrated] = useState(false);
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('auto');
  const { document, error, loading, progressStage, elapsedSeconds, notice, setNotice, extract, cancel, loadDocument } =
    useTranscriptExtraction(url, language);
  const [readingProgress, setReadingProgress] = useState(0);
  const readerBodyRef = useRef<HTMLDivElement>(null);
  const readingProgressRef = useRef(0);
  const { copied, copyText } = useClipboard();
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    mode: searchMode,
    setMode: setSearchMode,
    debouncedQuery: debouncedSearchQuery,
    results: visibleSearchResults,
    semanticSearch: usesSemanticFallback,
    activeIndex: activeSearchIndex,
    setActiveIndex: setActiveSearchIndex,
  } = useTranscriptSearch(document?.segments || []);
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [bookmarkedSegments, setBookmarkedSegments] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteDraft, setNoteDraft] = useState('');
  const [question, setQuestion] = useState('');
  const debouncedQuestion = useDebouncedValue(question, 220);
  const storageHydratedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importedWorkspaceRef = useRef<{ sourceUrl: string; bookmarks: number[]; notes: Record<number, string> } | null>(
    null,
  );
  const sharedLoadedRef = useRef(false);
  const { entries: libraryEntries, save: saveLibrary, remove: removeLibrary } = useTranscriptLibrary();

  const platform = useMemo(() => detectPlatform(url), [url]);
  const paragraphs = useMemo(() => (document ? toReadableParagraphs(document.segments) : []), [document]);
  const insights = useMemo(
    () => (document ? extractTranscriptInsights(document.segments) : { keywords: [], highlights: [] }),
    [document],
  );
  const summary = useMemo(
    () => (document ? extractiveSummary(document.segments, insights.keywords, 3) : []),
    [document, insights.keywords],
  );
  const chapters = useMemo(() => (document ? buildTranscriptChapters(document.segments) : []), [document]);
  const actionItems = useMemo(() => (document ? extractActionItems(document.segments) : []), [document]);
  const answer = useMemo(
    () =>
      document
        ? answerTranscriptQuestion(document.segments, debouncedQuestion)
        : { confidence: 'low' as const, results: [] },
    [document, debouncedQuestion],
  );
  const wordCount = useMemo(
    () => paragraphs.reduce((count, paragraph) => count + (paragraph.match(/\S+/g)?.length || 0), 0),
    [paragraphs],
  );
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const sharedUrl = new URLSearchParams(window.location.search).get('url');
    if (sharedUrl && !sharedLoadedRef.current) {
      sharedLoadedRef.current = true;
      setUrl(sharedUrl);
      void extract(sharedUrl);
    }
  }, [extract]);

  useEffect(() => {
    setActiveSearchIndex(0);
    if (debouncedSearchQuery.trim() && visibleSearchResults.length > 0) {
      setViewMode('raw');
      setActiveSegmentId(visibleSearchResults[0].segmentId);
    }
  }, [debouncedSearchQuery, visibleSearchResults, setActiveSearchIndex]);

  useEffect(() => {
    if (!document) return;
    if (!saveLibrary(document)) setNotice('Transcript quá lớn để lưu vào thư viện trên thiết bị này.');
  }, [document, saveLibrary, setNotice]);

  useEffect(() => {
    if (!document) return;
    const syncHash = () => {
      const match = window.location.hash.match(/^#segment-(\d+)$/);
      const segmentId = match ? Number(match[1]) : null;
      if (segmentId === null || segmentId < 0 || segmentId >= document.segments.length) {
        setActiveSegmentId(null);
        return;
      }
      setViewMode('raw');
      setActiveSegmentId(segmentId);
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [document]);

  useEffect(() => {
    if (viewMode !== 'raw' || activeSegmentId === null) return;
    const frame = window.requestAnimationFrame(() => {
      segmentRefs.current[activeSegmentId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSegmentId, viewMode]);

  useEffect(() => {
    setReadingProgress(0);
    readingProgressRef.current = 0;
    const frame = window.requestAnimationFrame(() => {
      const element = readerBodyRef.current;
      if (!element) return;
      element.scrollTo({ top: 0 });
      const scrollableHeight = element.scrollHeight - element.clientHeight;
      setReadingProgress(scrollableHeight <= 0 ? 100 : 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document]);

  useEffect(() => {
    if (!document) return;
    storageHydratedRef.current = false;
    const imported = importedWorkspaceRef.current;
    if (imported?.sourceUrl === document.sourceUrl) {
      setBookmarkedSegments(imported.bookmarks);
      setNotes(imported.notes);
      importedWorkspaceRef.current = null;
      storageHydratedRef.current = true;
      setNoteDraft('');
      setQuestion('');
      return;
    }
    const storageKey = `clipread:workspace:${document.sourceUrl}`;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as {
        bookmarks?: number[];
        notes?: Record<number, string>;
      };
      setBookmarkedSegments(Array.isArray(saved.bookmarks) ? saved.bookmarks : []);
      setNotes(saved.notes && typeof saved.notes === 'object' ? saved.notes : {});
    } catch {
      setBookmarkedSegments([]);
      setNotes({});
    }
    storageHydratedRef.current = true;
    setNoteDraft('');
    setQuestion('');
  }, [document]);

  useEffect(() => {
    if (!document || !storageHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        `clipread:workspace:${document.sourceUrl}`,
        JSON.stringify({ bookmarks: bookmarkedSegments, notes }),
      );
    } catch {
      setNotice('Không thể lưu bookmark/ghi chú trên trình duyệt này. Nội dung transcript vẫn hoạt động bình thường.');
    }
  }, [document, bookmarkedSegments, notes, setNotice]);

  const handleReaderScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const scrollableHeight = element.scrollHeight - element.clientHeight;
    const percentage = scrollableHeight <= 0 ? 100 : Math.round((element.scrollTop / scrollableHeight) * 100);
    const nextProgress = Math.min(100, Math.max(0, percentage));
    if (nextProgress !== readingProgressRef.current) {
      readingProgressRef.current = nextProgress;
      setReadingProgress(nextProgress);
    }
  };

  const scrollToSegment = (segmentId: number) => {
    setViewMode('raw');
    setActiveSegmentId(segmentId);
    const query = document ? `?url=${encodeURIComponent(document.sourceUrl)}` : '';
    window.history.replaceState(null, '', `${query}#segment-${segmentId}`);
  };

  const shareTranscript = async () => {
    if (!document) return;
    const link = `${window.location.origin}/?url=${encodeURIComponent(document.sourceUrl)}${activeSegmentId === null ? '' : `#segment-${activeSegmentId}`}`;
    if (await copyText(link)) setNotice('Đã copy link transcript có thể chia sẻ.');
    else setNotice('Không thể copy link. Hãy copy URL hiện tại trên thanh địa chỉ.');
  };

  const toggleBookmark = (segmentId: number) => {
    setBookmarkedSegments((current) =>
      current.includes(segmentId)
        ? current.filter((id) => id !== segmentId)
        : [...current, segmentId].sort((a, b) => a - b),
    );
  };

  const saveNote = (segmentId: number) => {
    const text = noteDraft.trim();
    if (!text) return;
    setNotes((current) => ({ ...current, [segmentId]: text }));
    setNoteDraft('');
    setNotice('Đã lưu ghi chú trên thiết bị này.');
  };

  const removeNote = (segmentId: number) => {
    setNotes((current) => {
      const next = { ...current };
      delete next[segmentId];
      return next;
    });
    setNotice('Đã xóa ghi chú trên thiết bị này.');
  };

  const exportKnowledge = () => {
    if (!document) return;
    const lines = [
      `# ${document.title}`,
      '',
      '## Tóm tắt',
      ...summary.map((item) => `- [${formatTimestamp(item.offset)}] ${item.text}`),
      '',
      '## Chapters',
      ...chapters.map((chapter) => `- [${formatTimestamp(chapter.offset)}] ${chapter.title}`),
      '',
      '## Action items',
      ...(actionItems.length
        ? actionItems.map((item) => `- [ ] [${formatTimestamp(item.offset)}] ${item.text}`)
        : ['- Không phát hiện action item']),
      '',
      '## Highlights',
      ...insights.highlights.map((item) => `- [${formatTimestamp(item.offset)}] ${item.text}`),
      '',
      '## Keywords',
      ...insights.keywords.map((keyword) => `- ${keyword.term} (${keyword.count})`),
      '',
      '## Bookmarks',
      ...(bookmarkedSegments.length
        ? bookmarkedSegments.flatMap((segmentId) => {
            const item = document.segments[segmentId];
            return item ? [`- [${formatTimestamp(item.offset)}] ${item.text}`] : [];
          })
        : ['- Không có bookmark']),
      '',
      '## Notes',
      ...(Object.entries(notes).length
        ? Object.entries(notes).map(
            ([segmentId, text]) => `- [${formatTimestamp(document.segments[Number(segmentId)]?.offset ?? 0)}] ${text}`,
          )
        : ['- Không có ghi chú']),
      '',
      '## Q&A',
      ...(question.trim()
        ? [
            `Câu hỏi: ${question.trim()}`,
            ...(answer.results.length
              ? answer.results.map((result) => `- [${formatTimestamp(result.offset)}] ${result.text}`)
              : ['- Không tìm thấy đoạn liên quan']),
          ]
        : ['- Chưa đặt câu hỏi']),
    ];
    downloadText(lines.join('\n'), `${base}-notes.md`, 'text/markdown');
  };

  const exportWorkspace = () => {
    if (!document) return;
    downloadText(
      JSON.stringify({ schemaVersion: 1, document, bookmarks: bookmarkedSegments, notes }, null, 2),
      `${base}-workspace.json`,
      'application/json',
    );
  };

  const importWorkspace = async (file: File) => {
    try {
      const serialized = await file.text();
      const value = parseTranscriptWorkspace(JSON.parse(serialized), serialized.length);
      const importedBookmarks = value.bookmarks;
      const importedNotes = value.notes as Record<number, string>;
      importedWorkspaceRef.current = {
        sourceUrl: value.document.sourceUrl,
        bookmarks: importedBookmarks,
        notes: importedNotes,
      };
      loadDocument(value.document);
      setNotice('Đã nhập workspace trên thiết bị này.');
    } catch {
      setNotice('File workspace không hợp lệ hoặc không thể đọc.');
    }
  };

  const moveSearch = (direction: 1 | -1) => {
    if (visibleSearchResults.length === 0) return;
    const nextIndex = (activeSearchIndex + direction + visibleSearchResults.length) % visibleSearchResults.length;
    setActiveSearchIndex(nextIndex);
    scrollToSegment(visibleSearchResults[nextIndex].segmentId);
  };

  const copy = async () => {
    if (!document) return;
    const success = await copyText(toPlainText(document));
    if (!success) setNotice('Không thể copy tự động. Hãy kiểm tra quyền clipboard hoặc tải file Văn bản.');
  };

  const base = document ? slug(document.title) : 'clipread-transcript';
  const progress = progressStages[progressStage];

  return (
    <main className="shell" data-hydrated={hydrated ? 'true' : 'false'}>
      <header className="topbar">
        <div className="brand">
          <span>CR</span>
          <strong>ClipRead</strong>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="kicker">
            <Sparkles size={14} /> video thành bản đọc
          </span>
          <h1>
            Xem ít hơn. <em>Nắm nhiều hơn.</em>
          </h1>
          <p>
            Dán link video để biến phụ đề thành bản đọc dễ theo dõi. Tìm nhanh ý quan trọng, xem lại theo mốc thời gian
            và xuất thành Markdown, TXT hoặc SRT.
          </p>
        </div>

        <div className="input-card">
          <label htmlFor="video-url">Đường dẫn video</label>
          <div className="url-row">
            <Link2 size={19} />
            <input
              id="video-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <span className={`platform ${platform}`}>{platform === 'unknown' ? 'link' : platform}</span>
          </div>
          <div className="input-actions">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label="Ngôn ngữ transcript"
            >
              <option value="auto">Ngôn ngữ: Tự động</option>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
            <button type="button" onClick={() => void extract()} disabled={!url.trim() || loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <BookOpenText size={18} />}
              {loading ? progress.label : 'Biến thành bài đọc'}
            </button>
          </div>
          <small>
            YouTube ưu tiên caption nhanh; TikTok/Facebook dùng worker local thử nghiệm. Video không có caption sẽ được
            chuyển sang Whisper local.
          </small>
        </div>
      </section>

      <TranscriptFeedback
        error={error}
        onRetry={() => void extract()}
        loading={loading}
        progress={progress}
        elapsedSeconds={elapsedSeconds}
        onCancel={cancel}
        notice={notice}
      />

      {!document && !error && (
        <section className="empty-state">
          <div>
            <Subtitles size={28} />
          </div>
          <h2>Một link vào. Một bài đọc ra.</h2>
          <p>ClipRead ưu tiên caption có sẵn — nhanh, nhẹ và không cần upload audio.</p>
          <div className="flow">
            <span>Đường dẫn</span>
            <b>→</b>
            <span>Caption</span>
            <b>→</b>
            <span>Văn bản sạch</span>
            <b>→</b>
            <span>Xuất file</span>
          </div>
          <TranscriptLibraryPanel
            entries={libraryEntries}
            onOpen={(entry) => {
              setUrl(entry.sourceUrl);
              setNotice('Đã chọn transcript gần đây. Bấm “Biến thành bài đọc” để tải lại.');
            }}
            onRemove={removeLibrary}
          />
        </section>
      )}

      {document && (
        <section className="workspace">
          <aside className="meta-card">
            {document.thumbnail && <img src={document.thumbnail} alt="Thumbnail video" />}
            <span className="source-badge">{document.platform}</span>
            <h2>{document.title}</h2>
            {document.author && <p>{document.author}</p>}
            <dl>
              <div>
                <dt>Từ</dt>
                <dd>{wordCount.toLocaleString('vi-VN')}</dd>
              </div>
              <div>
                <dt>Thời gian đọc</dt>
                <dd>~{readingMinutes} phút</dd>
              </div>
              <div>
                <dt>Đoạn caption</dt>
                <dd>{document.segments.length}</dd>
              </div>
            </dl>
            <TranscriptWorkspaceActions
              inputRef={importInputRef}
              onExport={exportWorkspace}
              onImport={(file) => void importWorkspace(file)}
              onShare={() => void shareTranscript()}
            />
            <TranscriptKnowledgeCard
              summary={summary}
              chapters={chapters}
              actionItems={actionItems}
              highlights={insights.highlights}
              keywords={insights.keywords}
              question={question}
              answer={answer}
              onQuestionChange={setQuestion}
              onSegmentClick={scrollToSegment}
              onExport={exportKnowledge}
              formatTimestamp={formatTimestamp}
            />
            <TranscriptSavedPanel
              document={document}
              bookmarkedSegments={bookmarkedSegments}
              notes={notes}
              onSegmentClick={scrollToSegment}
              onToggleBookmark={toggleBookmark}
              onRemoveNote={removeNote}
            />
          </aside>

          <TranscriptReader
            document={document}
            paragraphs={paragraphs}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            readingProgress={readingProgress}
            base={base}
            copied={copied}
            onCopy={copy}
            onDownload={downloadText}
            searchQuery={searchQuery}
            searchHighlightQuery={debouncedSearchQuery}
            onSearchQueryChange={setSearchQuery}
            searchResults={visibleSearchResults}
            semanticSearch={usesSemanticFallback}
            searchMode={searchMode}
            onSearchModeChange={setSearchMode}
            onMoveSearch={moveSearch}
            readerBodyRef={readerBodyRef}
            onReaderScroll={handleReaderScroll}
            activeSegmentId={activeSegmentId}
            segmentRefs={segmentRefs}
            bookmarkedSegments={bookmarkedSegments}
            notes={notes}
            noteDraft={noteDraft}
            onToggleBookmark={toggleBookmark}
            onOpenNote={(segmentId) => {
              setActiveSegmentId(segmentId);
              setNoteDraft(notes[segmentId] || '');
            }}
            onNoteDraftChange={setNoteDraft}
            onSaveNote={saveNote}
            onSegmentClick={scrollToSegment}
          />
        </section>
      )}

      <footer>
        <span>ClipRead v0.1.0</span>
        <span>Ưu tiên phụ đề · Không tài khoản · Không cơ sở dữ liệu</span>
      </footer>
    </main>
  );
};
