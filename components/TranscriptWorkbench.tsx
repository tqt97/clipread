'use client';

import { useMemo, useState } from 'react';
import { BookOpenText, Check, Clipboard, Download, FileText, Link2, LoaderCircle, Sparkles, Subtitles, Text } from 'lucide-react';
import type { TranscriptDocument } from '@/domain/transcript';
import { detectPlatform, toMarkdown, toPlainText, toReadableParagraphs, toSrt } from '@/domain/transcript';

type ViewMode = 'read' | 'raw';

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
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('read');

  const platform = useMemo(() => detectPlatform(url), [url]);
  const paragraphs = useMemo(() => document ? toReadableParagraphs(document.segments) : [], [document]);
  const wordCount = useMemo(() => paragraphs.join(' ').split(/\s+/).filter(Boolean).length, [paragraphs]);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

  const extract = async () => {
    setLoading(true);
    setError(null);
    setDocument(null);
    try {
      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), language }),
      });
      const payload = await response.json() as { document?: TranscriptDocument; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error || 'Không thể lấy transcript.');
      setDocument(payload.document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lấy transcript.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!document) return;
    await navigator.clipboard.writeText(toPlainText(document));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const base = document ? slug(document.title) : 'clipread-transcript';

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
              {loading ? 'Đang đọc caption…' : 'Biến thành bài đọc'}
            </button>
          </div>
          <small>MVP hiện xử lý caption YouTube. TikTok/Facebook đã có nhận diện và seam provider để bổ sung sau.</small>
        </div>
      </section>

      {error && <section className="error-panel"><strong>Chưa thể tạo bài đọc</strong><p>{error}</p></section>}

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
            <div className="reader-toolbar">
              <div className="view-switch">
                <button className={viewMode === 'read' ? 'active' : ''} onClick={() => setViewMode('read')}><Text size={15}/> Bài đọc</button>
                <button className={viewMode === 'raw' ? 'active' : ''} onClick={() => setViewMode('raw')}><Subtitles size={15}/> Caption gốc</button>
              </div>
              <div className="export-actions">
                <button onClick={copy}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Đã copy' : 'Copy'}</button>
                <button onClick={() => downloadText(toMarkdown(document), `${base}.md`, 'text/markdown')}><FileText size={15}/> Markdown</button>
                <button onClick={() => downloadText(toPlainText(document), `${base}.txt`, 'text/plain')}><Download size={15}/> Văn bản</button>
                <button onClick={() => downloadText(toSrt(document.segments), `${base}.srt`, 'application/x-subrip')}><Download size={15}/> Phụ đề</button>
              </div>
            </div>

            <div className="reader-body">
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
