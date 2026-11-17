import { LoaderCircle } from 'lucide-react';
import type { TranscriptErrorPresentation } from '@/domain/api';

interface ProgressDetail {
  label: string;
  detail: string;
  step: number;
}

interface TranscriptFeedbackProps {
  error: TranscriptErrorPresentation | null;
  onRetry: () => void;
  loading: boolean;
  progress: ProgressDetail;
  elapsedSeconds: number;
  onCancel: () => void;
  notice: string | null;
}

export const TranscriptFeedback = ({
  error,
  onRetry,
  loading,
  progress,
  elapsedSeconds,
  onCancel,
  notice,
}: TranscriptFeedbackProps) => (
  <>
    {error && (
      <section className="error-panel" role="alert">
        <strong>{error.title}</strong>
        <p>{error.message}</p>
        {error.retryable && (
          <button type="button" onClick={onRetry}>
            Thử lại
          </button>
        )}
      </section>
    )}
    {loading && (
      <section className="progress-panel" aria-live="polite" aria-busy="true">
        <div className="progress-heading">
          <span className="progress-icon">
            <LoaderCircle className="spin" size={20} />
          </span>
          <div>
            <strong>{progress.label}</strong>
            <p>
              {progress.detail} Đã xử lý {elapsedSeconds} giây.
            </p>
          </div>
          <span className="progress-count">Bước {progress.step}/5</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={progress.step}
          aria-label={progress.label}
        >
          <span className="progress-fill-active" style={{ width: `${(progress.step / 5) * 100}%` }} />
        </div>
        <div className="progress-labels">
          <span>Nhận yêu cầu</span>
          <span>Caption</span>
          <span>Audio</span>
          <span>Whisper</span>
          <span>Hoàn tất</span>
        </div>
        <button type="button" className="progress-cancel" onClick={onCancel}>
          Dừng theo dõi
        </button>
      </section>
    )}
    {notice && (
      <section className="notice-panel" role="status">
        {notice}
      </section>
    )}
  </>
);
