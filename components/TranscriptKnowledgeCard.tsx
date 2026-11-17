import { Download, MessageCircleQuestion, Sparkles } from 'lucide-react';
import type { TranscriptKeyword, TranscriptHighlight } from '@/domain/insights';
import type {
  TranscriptActionItem,
  TranscriptAnswer,
  TranscriptChapter,
  TranscriptSummaryItem,
} from '@/domain/knowledge';

interface TranscriptKnowledgeCardProps {
  summary: TranscriptSummaryItem[];
  chapters: TranscriptChapter[];
  actionItems: TranscriptActionItem[];
  highlights: TranscriptHighlight[];
  keywords: TranscriptKeyword[];
  question: string;
  answer: TranscriptAnswer;
  onQuestionChange: (question: string) => void;
  onSegmentClick: (segmentId: number) => void;
  onExport: () => void;
  formatTimestamp: (seconds: number) => string;
}

export const TranscriptKnowledgeCard = ({
  summary,
  chapters,
  actionItems,
  highlights,
  keywords,
  question,
  answer,
  onQuestionChange,
  onSegmentClick,
  onExport,
  formatTimestamp,
}: TranscriptKnowledgeCardProps) => (
  <section className="knowledge-card" aria-label="Tóm tắt và ghi chú">
    <div className="knowledge-heading">
      <strong>
        <Sparkles size={15} /> Hiểu nhanh
      </strong>
      <button type="button" onClick={onExport} aria-label="Xuất tóm tắt và highlights">
        <Download size={14} /> Xuất
      </button>
    </div>
    <h3>Tóm tắt</h3>
    {summary.length > 0 ? (
      <p className="summary-paragraph">{summary.map((item) => item.text).join(' ')}</p>
    ) : (
      <p className="muted-item">Chưa đủ dữ liệu để tóm tắt.</p>
    )}
    {highlights.length > 0 && (
      <details className="knowledge-disclosure" open>
        <summary>Điểm đáng chú ý ({highlights.length})</summary>
        <ol className="highlight-list">
          {highlights.map((highlight) => (
            <li key={highlight.segmentId}>
              <button type="button" onClick={() => onSegmentClick(highlight.segmentId)}>
                <span>{highlight.text}</span>
                <time>{formatTimestamp(highlight.offset)}</time>
              </button>
            </li>
          ))}
        </ol>
      </details>
    )}
    {keywords.length > 0 && (
      <div className="keyword-section">
        <span className="keyword-title">Cụm từ khóa</span>
        <div className="keyword-list">
          {keywords.map((keyword) => (
            <button
              type="button"
              className="keyword-chip"
              key={keyword.term}
              onClick={() => {
                onQuestionChange(keyword.term);
                onSegmentClick(keyword.segmentIds[0]);
              }}
            >
              {keyword.term}
              <small>{keyword.count}</small>
            </button>
          ))}
        </div>
      </div>
    )}
    {actionItems.length > 0 && (
      <details className="knowledge-disclosure">
        <summary>Action items ({actionItems.length})</summary>
        <ul className="action-list">
          {actionItems.map((item) => (
            <li key={item.segmentId}>
              <button type="button" onClick={() => onSegmentClick(item.segmentId)}>
                <span>□</span>
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </details>
    )}
    {chapters.length > 0 && (
      <details className="knowledge-disclosure">
        <summary>Chapters ({chapters.length})</summary>
        <ul className="chapter-list">
          {chapters.map((chapter) => (
            <li key={chapter.index}>
              <button type="button" onClick={() => onSegmentClick(chapter.segmentIds[0])}>
                <time>{formatTimestamp(chapter.offset)}</time>
                <span>{chapter.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    )}
    <div className="qa-box">
      <label htmlFor="transcript-question">
        <MessageCircleQuestion size={14} /> Hỏi transcript
      </label>
      <input
        id="transcript-question"
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="Ví dụ: worker dùng để làm gì?"
      />
      {question.trim() && (
        <div className="qa-answer">
          <small>
            Độ tin cậy: {answer.confidence === 'high' ? 'cao' : answer.confidence === 'medium' ? 'vừa' : 'thấp'}
          </small>
          {answer.results.length > 0 ? (
            answer.results.map((result) => (
              <button type="button" key={result.segmentId} onClick={() => onSegmentClick(result.segmentId)}>
                <time>{formatTimestamp(result.offset)}</time>
                {result.text}
              </button>
            ))
          ) : (
            <p>Không tìm thấy câu trả lời trực tiếp trong transcript.</p>
          )}
        </div>
      )}
    </div>
  </section>
);
