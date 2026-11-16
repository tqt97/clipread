'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { BookOpenText, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, Clipboard, Download, ExternalLink, FileText, Link2, LoaderCircle, MessageCircleQuestion, Search, Sparkles, StickyNote, Subtitles, Text } from 'lucide-react';
import type { TranscriptDocument } from '@/domain/transcript';
import { presentTranscriptError, type TranscriptErrorPresentation } from '@/domain/api';
import { normalizeTranscriptionJobStage, type TranscriptionJobResponse, type TranscriptionJobStage } from '@/domain/transcription-job';
import { detectPlatform, toMarkdown, toPlainText, toReadableParagraphs, toSrt } from '@/domain/transcript';
import { extractTranscriptInsights, normalizeSearchText, searchTranscript, toTimestampUrl } from '@/domain/insights';
import { answerTranscriptQuestion, buildTranscriptChapters, extractActionItems, extractiveSummary } from '@/domain/knowledge';

type ViewMode = 'read' | 'raw';
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const INITIAL_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 3000;

class TranscriptClientError extends Error {
  constructor(public readonly code?: string, message?: string) {
    super(message || 'Transcript request failed.');
  }
}

const waitFor = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const onAbort = () => {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    reject(new DOMException('Polling đã bị hủy.', 'AbortError'));
  };
  const timer = window.setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  if (signal.aborted) {
    onAbort();
    return;
  }
  signal.addEventListener('abort', onAbort, { once: true });
});

const progressStages: Record<TranscriptionJobStage, { label: string; detail: string; step: number }> = {
  queued: { label: 'Đã nhận yêu cầu', detail: 'Đang xếp job vào worker local.', step: 1 },
  fetching_metadata: { label: 'Đang phân tích nguồn video', detail: 'Nguồn video có thể mất thêm thời gian để lấy metadata và kiểm tra khả năng đọc caption.', step: 1 },
  checking_captions: { label: 'Đang kiểm tra phụ đề', detail: 'Ưu tiên caption có sẵn trước khi dùng Whisper.', step: 2 },
  downloading_audio: { label: 'Đang chuẩn bị audio', detail: 'Video chưa có caption, đang lấy audio tạm thời.', step: 3 },
  transcribing: { label: 'Whisper đang chuyển giọng nói thành chữ', detail: 'Bước này có thể lâu hơn tùy độ dài video và cấu hình máy.', step: 4 },
  finalizing: { label: 'Đang hoàn thiện bài đọc', detail: 'Đang chuẩn hóa đoạn text và timestamp.', step: 5 },
  completed: { label: 'Đã hoàn tất', detail: 'Transcript đã sẵn sàng.', step: 5 },
};

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

const slug = (value: string): string => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 72) || 'clipread-transcript';

const formatTimestamp = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const renderSearchText = (text: string, query: string) => {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return text;

  const originalChars = Array.from(text);
  let normalizedText = '';
  const normalizedStarts: number[] = [];
  const normalizedEnds: number[] = [];
  let originalOffset = 0;
  originalChars.forEach((character) => {
    const normalized = normalizeSearchText(character);
    const originalEnd = originalOffset + character.length;
    for (let index = 0; index < normalized.length; index += 1) {
      normalizedStarts.push(originalOffset);
      normalizedEnds.push(originalEnd);
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
    ranges.push([normalizedStarts[matchStart], normalizedEnds[matchEnd]]);
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

export const TranscriptWorkbench = () => {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('auto');
  const [document, setDocument] = useState<TranscriptDocument | null>(null);
  const [error, setError] = useState<TranscriptErrorPresentation | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<TranscriptionJobStage>('checking_captions');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [readingProgress, setReadingProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const readerBodyRef = useRef<HTMLDivElement>(null);
  const readingProgressRef = useRef(0);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const pollingCancelledRef = useRef(false);
  const [copied, setCopied] = useState(false);
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
  const paragraphs = useMemo(() => document ? toReadableParagraphs(document.segments) : [], [document]);
  const insights = useMemo(() => document ? extractTranscriptInsights(document.segments) : { keywords: [], highlights: [] }, [document]);
  const summary = useMemo(() => document ? extractiveSummary(document.segments, insights.keywords, 3) : [], [document, insights.keywords]);
  const chapters = useMemo(() => document ? buildTranscriptChapters(document.segments) : [], [document]);
  const actionItems = useMemo(() => document ? extractActionItems(document.segments) : [], [document]);
  const answer = useMemo(() => document ? answerTranscriptQuestion(document.segments, question) : { confidence: 'low' as const, results: [] }, [document, question]);
  const searchResults = useMemo(() => document ? searchTranscript(document.segments, searchQuery) : [], [document, searchQuery]);
  const wordCount = useMemo(() => paragraphs.join(' ').split(/\s+/).filter(Boolean).length, [paragraphs]);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

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
    if (!loading) {
      setElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading]);

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
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as { bookmarks?: number[]; notes?: Record<number, string> };
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
      window.localStorage.setItem(`clipread:workspace:${document.sourceUrl}`, JSON.stringify({ bookmarks: bookmarkedSegments, notes }));
    } catch {
      setNotice('Không thể lưu bookmark/ghi chú trên trình duyệt này. Nội dung transcript vẫn hoạt động bình thường.');
    }
  }, [document, bookmarkedSegments, notes]);

  useEffect(() => () => pollingAbortRef.current?.abort(), []);

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
    setBookmarkedSegments((current) => current.includes(segmentId)
      ? current.filter((id) => id !== segmentId)
      : [...current, segmentId].sort((a, b) => a - b));
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
      ...(actionItems.length ? actionItems.map((item) => `- [ ] [${formatTimestamp(item.offset)}] ${item.text}`) : ['- Không phát hiện action item']),
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

  const extract = async () => {
    const controller = new AbortController();
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = controller;
    pollingCancelledRef.current = false;
    setLoading(true);
    setProgressStage('checking_captions');
    setError(null);
    setNotice(null);
    setDocument(null);
    try {
      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), language }),
        signal: controller.signal,
      });
      const payload = await response.json() as TranscriptionJobResponse & { error?: string; code?: string };
      if (!response.ok) throw new TranscriptClientError(payload.code, payload.error);

      if (response.status === 202 && payload.jobId) {
        let job = payload;
        setProgressStage(normalizeTranscriptionJobStage(job.stage));
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let pollDelay = INITIAL_POLL_DELAY_MS;
        while (job.status === 'queued' || job.status === 'running') {
          if (Date.now() >= deadline) throw new Error('TRANSCRIPTION_TIMEOUT');
          await waitFor(pollDelay, controller.signal);
          const statusResponse = await fetch(`/api/transcript/jobs/${encodeURIComponent(job.jobId)}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          job = await statusResponse.json() as TranscriptionJobResponse;
          if (!statusResponse.ok) throw new TranscriptClientError(job.code, job.error);
          setProgressStage(normalizeTranscriptionJobStage(job.stage, job.status === 'queued' ? 'queued' : 'fetching_metadata'));
          pollDelay = Math.min(MAX_POLL_DELAY_MS, Math.round(pollDelay * 1.5));
        }
        if (job.status === 'failed' || !job.document) throw new TranscriptClientError(job.code, job.error);
        setProgressStage('completed');
        setDocument(job.document);
      } else if (payload.document) {
        setProgressStage('completed');
        setDocument(payload.document);
      } else {
        throw new TranscriptClientError(payload.code, payload.error);
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError' && pollingCancelledRef.current) return;
      if (caught instanceof Error && caught.message === 'TRANSCRIPTION_TIMEOUT') {
        setError(presentTranscriptError(undefined, 'timeout'));
      } else if (caught instanceof TypeError) {
        setError(presentTranscriptError(undefined, 'network'));
      } else if (caught instanceof TranscriptClientError) {
        setError(presentTranscriptError(caught.code));
      } else {
        setError(presentTranscriptError());
      }
    } finally {
      if (pollingAbortRef.current === controller) pollingAbortRef.current = null;
      setLoading(false);
    }
  };

  const cancelPolling = () => {
    pollingCancelledRef.current = true;
    pollingAbortRef.current?.abort();
    setLoading(false);
    setNotice('Đã dừng theo dõi job. Worker có thể vẫn đang xử lý ở phía sau.');
  };

  const copy = async () => {
    if (!document) return;
    await navigator.clipboard.writeText(toPlainText(document));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const base = document ? slug(document.title) : 'clipread-transcript';
  const progress = progressStages[progressStage];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span>CR</span><strong>ClipRead</strong></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="kicker"><Sparkles size={14} /> video thành bản đọc</span>
          <h1>Xem ít hơn. <em>Nắm nhiều hơn.</em></h1>
          <p>Dán link video để biến phụ đề thành bản đọc dễ theo dõi. Tìm nhanh ý quan trọng, xem lại theo mốc thời gian và xuất thành Markdown, TXT hoặc SRT.</p>
        </div>

        <div className="input-card">
          <label htmlFor="video-url">Đường dẫn video</label>
          <div className="url-row">
            <Link2 size={19} />
            <input id="video-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
            <span className={`platform ${platform}`}>{platform === 'unknown' ? 'link' : platform}</span>
          </div>
          <div className="input-actions">
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Ngôn ngữ transcript">
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
          <small>YouTube ưu tiên caption nhanh; TikTok/Facebook dùng worker local thử nghiệm. Video không có caption sẽ được chuyển sang Whisper local.</small>
        </div>
      </section>

      {error && (
        <section className="error-panel" role="alert">
          <strong>{error.title}</strong>
          <p>{error.message}</p>
          {error.retryable && <button type="button" onClick={extract}>Thử lại</button>}
        </section>
      )}

      {loading && (
        <section className="progress-panel" aria-live="polite" aria-busy="true">
          <div className="progress-heading">
            <span className="progress-icon"><LoaderCircle className="spin" size={20} /></span>
            <div>
              <strong>{progress.label}</strong>
              <p>{progress.detail} Đã xử lý {elapsedSeconds} giây.</p>
            </div>
            <span className="progress-count">Bước {progress.step}/5</span>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={progress.step} aria-label={progress.label}>
            <span className="progress-fill-active" style={{ width: `${(progress.step / 5) * 100}%` }} />
          </div>
          <div className="progress-labels"><span>Nhận yêu cầu</span><span>Caption</span><span>Audio</span><span>Whisper</span><span>Hoàn tất</span></div>
          <button type="button" className="progress-cancel" onClick={cancelPolling}>Dừng theo dõi</button>
        </section>
      )}

      {notice && <section className="notice-panel" role="status">{notice}</section>}

      {!document && !error && (
        <section className="empty-state">
          <div><Subtitles size={28} /></div>
          <h2>Một link vào. Một bài đọc ra.</h2>
          <p>ClipRead ưu tiên caption có sẵn — nhanh, nhẹ và không cần upload audio.</p>
          <div className="flow"><span>Đường dẫn</span><b>→</b><span>Caption</span><b>→</b><span>Văn bản sạch</span><b>→</b><span>Xuất file</span></div>
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
              <div><dt>Từ</dt><dd>{wordCount.toLocaleString('vi-VN')}</dd></div>
              <div><dt>Thời gian đọc</dt><dd>~{readingMinutes} phút</dd></div>
              <div><dt>Đoạn caption</dt><dd>{document.segments.length}</dd></div>
            </dl>
            {(insights.highlights.length > 0 || insights.keywords.length > 0) && (
              <section className="insights-card" aria-label="Điểm đáng chú ý">
                <div className="insights-heading">
                  <strong>Điểm đáng chú ý</strong>
                  <small>Không dùng AI</small>
                </div>
                {insights.highlights.length > 0 && (
                  <ol className="highlight-list">
                    {insights.highlights.map((highlight) => (
                      <li key={highlight.segmentId}>
                        <button type="button" onClick={() => scrollToSegment(highlight.segmentId)}>
                          <span>{highlight.text}</span>
                          <time>{formatTimestamp(highlight.offset)}</time>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {insights.keywords.length > 0 && (
                  <div className="keyword-section">
                    <span className="keyword-title">Cụm từ khóa</span>
                    <div className="keyword-list">
                      {insights.keywords.map((keyword) => (
                        <button
                          type="button"
                          className="keyword-chip"
                          key={keyword.term}
                          onClick={() => {
                            setSearchQuery(keyword.term);
                            scrollToSegment(keyword.segmentIds[0]);
                          }}
                        >
                          {keyword.term}<small>{keyword.count}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
            <section className="knowledge-card" aria-label="Tóm tắt và ghi chú">
              <div className="knowledge-heading">
                <strong><Sparkles size={15} /> Hiểu nhanh</strong>
                <button type="button" onClick={exportKnowledge} aria-label="Xuất tóm tắt và highlights"><Download size={14} /> Xuất</button>
              </div>
              <h3>Tóm tắt</h3>
              {summary.length > 0
                ? <p className="summary-paragraph">{summary.map((item) => item.text).join(' ')}</p>
                : <p className="muted-item">Chưa đủ dữ liệu để tóm tắt.</p>}
              {actionItems.length > 0 && <>
                <h3>Action items</h3>
                <ul className="action-list">{actionItems.map((item) => <li key={item.segmentId}><button type="button" onClick={() => scrollToSegment(item.segmentId)}><span>□</span>{item.text}</button></li>)}</ul>
              </>}
              <div className="qa-box">
                <label htmlFor="transcript-question"><MessageCircleQuestion size={14} /> Hỏi transcript</label>
                <input id="transcript-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ví dụ: worker dùng để làm gì?" />
                {question.trim() && <div className="qa-answer"><small>Độ tin cậy: {answer.confidence === 'high' ? 'cao' : answer.confidence === 'medium' ? 'vừa' : 'thấp'}</small>{answer.results.length > 0 ? answer.results.map((result) => <button type="button" key={result.segmentId} onClick={() => scrollToSegment(result.segmentId)}><time>{formatTimestamp(result.offset)}</time>{result.text}</button>) : <p>Không tìm thấy câu trả lời trực tiếp trong transcript.</p>}</div>}
              </div>
            </section>
          </aside>

          <article className="reader-card">
            <div className="reading-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readingProgress} aria-label={`Đã đọc ${readingProgress}%`}>
              <span style={{ width: `${readingProgress}%` }} />
            </div>
            <div className="reader-toolbar">
              <div className="view-switch">
                <button className={viewMode === 'read' ? 'active' : ''} onClick={() => setViewMode('read')}><Text size={15}/> Bài đọc</button>
                <button className={viewMode === 'raw' ? 'active' : ''} onClick={() => setViewMode('raw')}><Subtitles size={15}/> Caption gốc</button>
              </div>
              <span className="reading-progress-label">Đã đọc {readingProgress}%</span>
              <div className="export-actions">
                <button onClick={copy}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Đã copy' : 'Copy'}</button>
                <button onClick={() => downloadText(toMarkdown(document), `${base}.md`, 'text/markdown')}><FileText size={15}/> Markdown</button>
                <button onClick={() => downloadText(toPlainText(document), `${base}.txt`, 'text/plain')}><Download size={15}/> Văn bản</button>
                <button onClick={() => downloadText(toSrt(document.segments), `${base}.srt`, 'application/x-subrip')}><Download size={15}/> Phụ đề</button>
              </div>
            </div>
            <div className="transcript-search" role="search">
              <Search size={16} aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') moveSearch(event.shiftKey ? -1 : 1);
                }}
                placeholder="Tìm trong transcript..."
                aria-label="Tìm trong transcript"
              />
              <span>{searchQuery.trim() ? `${searchResults.length} kết quả` : 'Tìm kiếm'}</span>
              <button type="button" onClick={() => moveSearch(-1)} disabled={searchResults.length === 0} aria-label="Kết quả trước">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={() => moveSearch(1)} disabled={searchResults.length === 0} aria-label="Kết quả tiếp theo">
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="reader-body" ref={readerBodyRef} onScroll={handleReaderScroll}>
              {viewMode === 'read' ? paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>) : document.segments.map((segment, index) => (
                <div
                  className={`caption-row ${activeSegmentId === index ? 'active' : ''}`}
                  id={`segment-${index}`}
                  key={`${segment.offset}-${segment.text.slice(0, 20)}`}
                  ref={(element) => { segmentRefs.current[index] = element; }}
                >
                  <a
                    href={toTimestampUrl(document.sourceUrl, segment.offset)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => scrollToSegment(index)}
                    aria-label={`Mở video tại ${formatTimestamp(segment.offset)}`}
                  >
                    {formatTimestamp(segment.offset)} <ExternalLink size={11} />
                  </a>
                  <span>{renderSearchText(segment.text, searchQuery)}</span>
                  <div className="caption-tools">
                    <button type="button" onClick={() => toggleBookmark(index)} aria-label={bookmarkedSegments.includes(index) ? 'Bỏ bookmark' : 'Đánh dấu bookmark'} title={bookmarkedSegments.includes(index) ? 'Bỏ bookmark' : 'Bookmark'}>{bookmarkedSegments.includes(index) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}</button>
                    <button type="button" onClick={() => { setActiveSegmentId(index); setNoteDraft(notes[index] || ''); }} aria-label="Thêm ghi chú" title="Ghi chú"><StickyNote size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            {viewMode === 'raw' && activeSegmentId !== null && (
              <div className="note-editor">
                <label htmlFor="segment-note">Ghi chú cho đoạn {formatTimestamp(document.segments[activeSegmentId]?.offset ?? 0)}</label>
                <div><input id="segment-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Viết ghi chú riêng của bạn..." /><button type="button" onClick={() => saveNote(activeSegmentId)}>Lưu ghi chú</button></div>
              </div>
            )}
          </article>
        </section>
      )}

      <footer><span>ClipRead v0.1.0</span><span>Ưu tiên phụ đề · Không tài khoản · Không cơ sở dữ liệu</span></footer>
    </main>
  );
};
