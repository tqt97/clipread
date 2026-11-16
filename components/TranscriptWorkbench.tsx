'use client';

import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { BookOpenText, Check, Clipboard, Download, FileText, Link2, LoaderCircle, Sparkles, Subtitles, Text } from 'lucide-react';
import type { TranscriptDocument } from '@/domain/transcript';
import { normalizeTranscriptionJobStage, type TranscriptionJobResponse, type TranscriptionJobStage } from '@/domain/transcription-job';
import { detectPlatform, toMarkdown, toPlainText, toReadableParagraphs, toSrt } from '@/domain/transcript';

type ViewMode = 'read' | 'raw';
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const INITIAL_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 3000;

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

export const TranscriptWorkbench = () => {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('auto');
  const [document, setDocument] = useState<TranscriptDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const platform = useMemo(() => detectPlatform(url), [url]);
  const paragraphs = useMemo(() => document ? toReadableParagraphs(document.segments) : [], [document]);
  const wordCount = useMemo(() => paragraphs.join(' ').split(/\s+/).filter(Boolean).length, [paragraphs]);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

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
      const payload = await response.json() as TranscriptionJobResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Không thể lấy transcript.');

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
          if (!statusResponse.ok) throw new Error(job.error || 'Không thể đọc trạng thái transcription.');
          setProgressStage(normalizeTranscriptionJobStage(job.stage, job.status === 'queued' ? 'queued' : 'fetching_metadata'));
          pollDelay = Math.min(MAX_POLL_DELAY_MS, Math.round(pollDelay * 1.5));
        }
        if (job.status === 'failed' || !job.document) throw new Error(job.error || 'Không thể tạo transcript.');
        setProgressStage('completed');
        setDocument(job.document);
      } else if (payload.document) {
        setProgressStage('completed');
        setDocument(payload.document);
      } else {
        throw new Error(payload.error || 'Không thể lấy transcript.');
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError' && pollingCancelledRef.current) return;
      if (caught instanceof Error && caught.message === 'TRANSCRIPTION_TIMEOUT') {
        setError('Worker đã xử lý quá lâu. Bạn có thể thử lại với video ngắn hơn.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể lấy transcript.');
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
        <div className="status"><i /> MVP ưu tiên phụ đề</div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="kicker"><Sparkles size={14} /> video → tri thức có thể đọc</span>
          <h1>Đừng xem hết.<br/><em>Đọc phần đáng giá.</em></h1>
          <p>Paste một video link. ClipRead lấy caption có sẵn, làm sạch thành bài đọc và cho bạn xuất Markdown, TXT hoặc SRT.</p>
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

      {error && <section className="error-panel"><strong>Chưa thể tạo bài đọc</strong><p>{error}</p></section>}

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

            <div className="reader-body" ref={readerBodyRef} onScroll={handleReaderScroll}>
              {viewMode === 'read' ? paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>) : document.segments.map((segment) => (
                <div className="caption-row" key={`${segment.offset}-${segment.text.slice(0, 20)}`}>
                  <time>{Math.floor(segment.offset / 60)}:{String(Math.floor(segment.offset % 60)).padStart(2, '0')}</time>
                  <span>{segment.text}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      <footer><span>ClipRead v0.1.0</span><span>Ưu tiên phụ đề · Không tài khoản · Không cơ sở dữ liệu</span></footer>
    </main>
  );
};
