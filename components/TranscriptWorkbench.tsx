'use client';

import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { BookOpenText, Link2, LoaderCircle, Sparkles, Subtitles } from 'lucide-react';
import { detectPlatform, toPlainText, toReadableParagraphs } from '@/domain/transcript';
import { extractTranscriptInsights, searchTranscript } from '@/domain/insights';
import {
  answerTranscriptQuestion,
  buildTranscriptChapters,
  extractActionItems,
  extractiveSummary,
} from '@/domain/knowledge';
import { TranscriptFeedback } from './TranscriptFeedback';
import { TranscriptKnowledgeCard } from './TranscriptKnowledgeCard';
import { TranscriptReader } from './TranscriptReader';
import { useClipboard } from './hooks/useClipboard';
import { progressStages, useTranscriptExtraction } from './hooks/useTranscriptExtraction';
import type { ViewMode } from './transcript-workbench-types';

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
  const { document, error, loading, progressStage, elapsedSeconds, notice, setNotice, extract, cancel } =
    useTranscriptExtraction(url, language);
  const [readingProgress, setReadingProgress] = useState(0);
  const readerBodyRef = useRef<HTMLDivElement>(null);
  const readingProgressRef = useRef(0);
  const { copied, copyText } = useClipboard();
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [bookmarkedSegments, setBookmarkedSegments] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteDraft, setNoteDraft] = useState('');
  const [question, setQuestion] = useState('');
  const storageHydratedRef = useRef(false);

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
      document ? answerTranscriptQuestion(document.segments, question) : { confidence: 'low' as const, results: [] },
    [document, question],
  );
  const searchResults = useMemo(
    () => (document ? searchTranscript(document.segments, searchQuery) : []),
    [document, searchQuery],
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
    setActiveSearchIndex(0);
    if (searchQuery.trim() && searchResults.length > 0) {
      setViewMode('raw');
      setActiveSegmentId(searchResults[0].segmentId);
    }
  }, [searchQuery, searchResults]);

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
  }, [document, viewMode]);

  useEffect(() => {
    if (!document) return;
    storageHydratedRef.current = false;
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
    window.history.replaceState(null, '', `#segment-${segmentId}`);
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
    ];
    downloadText(lines.join('\n'), `${base}-notes.md`, 'text/markdown');
  };

  const moveSearch = (direction: 1 | -1) => {
    if (searchResults.length === 0) return;
    const nextIndex = (activeSearchIndex + direction + searchResults.length) % searchResults.length;
    setActiveSearchIndex(nextIndex);
    scrollToSegment(searchResults[nextIndex].segmentId);
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
            <button type="button" onClick={extract} disabled={!url.trim() || loading}>
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
        onRetry={extract}
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
            onSearchQueryChange={setSearchQuery}
            searchResults={searchResults}
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
