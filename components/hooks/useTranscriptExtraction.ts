'use client';

import { useEffect, useRef, useState } from 'react';
import { presentTranscriptError, type TranscriptErrorPresentation } from '@/domain/api';
import type { TranscriptDocument } from '@/domain/transcript';
import {
  normalizeTranscriptionJobStage,
  type TranscriptionJobResponse,
  type TranscriptionJobStage,
} from '@/domain/transcription-job';

const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const INITIAL_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 3000;

export const progressStages: Record<TranscriptionJobStage, { label: string; detail: string; step: number }> = {
  queued: { label: 'Đã nhận yêu cầu', detail: 'Đang xếp job vào worker local.', step: 1 },
  fetching_metadata: {
    label: 'Đang phân tích nguồn video',
    detail: 'Nguồn video có thể mất thêm thời gian để lấy metadata và kiểm tra khả năng đọc caption.',
    step: 1,
  },
  checking_captions: {
    label: 'Đang kiểm tra phụ đề',
    detail: 'Ưu tiên caption có sẵn trước khi dùng Whisper.',
    step: 2,
  },
  downloading_audio: {
    label: 'Đang chuẩn bị audio',
    detail: 'Video chưa có caption, đang lấy audio tạm thời.',
    step: 3,
  },
  transcribing: {
    label: 'Whisper đang chuyển giọng nói thành chữ',
    detail: 'Bước này có thể lâu hơn tùy độ dài video và cấu hình máy.',
    step: 4,
  },
  finalizing: { label: 'Đang hoàn thiện bài đọc', detail: 'Đang chuẩn hóa đoạn text và timestamp.', step: 5 },
  completed: { label: 'Đã hoàn tất', detail: 'Transcript đã sẵn sàng.', step: 5 },
};

class TranscriptClientError extends Error {
  constructor(
    public readonly code?: string,
    message?: string,
  ) {
    super(message || 'Transcript request failed.');
  }
}

const waitFor = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
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

export const useTranscriptExtraction = (url: string, language: string) => {
  const [document, setDocument] = useState<TranscriptDocument | null>(null);
  const [error, setError] = useState<TranscriptErrorPresentation | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<TranscriptionJobStage>('checking_captions');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const pollingCancelledRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => () => pollingAbortRef.current?.abort(), []);

  const extract = async (requestedUrl = url) => {
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
        body: JSON.stringify({ url: requestedUrl.trim(), language }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as TranscriptionJobResponse & { error?: string; code?: string };
      if (!response.ok) throw new TranscriptClientError(payload.code, payload.error);

      if (response.status === 202 && payload.jobId) {
        activeJobIdRef.current = payload.jobId;
        let job = payload;
        setProgressStage(normalizeTranscriptionJobStage(job.stage));
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let pollDelay = INITIAL_POLL_DELAY_MS;
        while (job.status === 'queued' || job.status === 'running' || job.status === 'cancel_requested') {
          if (Date.now() >= deadline) throw new Error('TRANSCRIPTION_TIMEOUT');
          await waitFor(pollDelay, controller.signal);
          const statusResponse = await fetch(`/api/transcript/jobs/${encodeURIComponent(job.jobId)}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          job = (await statusResponse.json()) as TranscriptionJobResponse;
          if (!statusResponse.ok) throw new TranscriptClientError(job.code, job.error);
          setProgressStage(
            normalizeTranscriptionJobStage(job.stage, job.status === 'queued' ? 'queued' : 'fetching_metadata'),
          );
          pollDelay = Math.min(MAX_POLL_DELAY_MS, Math.round(pollDelay * 1.5));
        }
        if (job.status === 'cancelled') {
          setNotice('Đã dừng xử lý job trên worker.');
          return;
        }
        if (job.status === 'failed' || job.status === 'dead_letter' || !job.document)
          throw new TranscriptClientError(job.code, job.error);
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
      if (caught instanceof Error && caught.message === 'TRANSCRIPTION_TIMEOUT')
        setError(presentTranscriptError(undefined, 'timeout'));
      else if (caught instanceof TypeError) setError(presentTranscriptError(undefined, 'network'));
      else if (caught instanceof TranscriptClientError) setError(presentTranscriptError(caught.code));
      else setError(presentTranscriptError());
    } finally {
      if (pollingAbortRef.current === controller) pollingAbortRef.current = null;
      activeJobIdRef.current = null;
      setLoading(false);
    }
  };

  const cancel = async () => {
    pollingCancelledRef.current = true;
    const jobId = activeJobIdRef.current;
    pollingAbortRef.current?.abort();
    setLoading(false);
    if (jobId) {
      const cancelController = new AbortController();
      const timer = window.setTimeout(() => cancelController.abort(), 5000);
      try {
        const response = await fetch(`/api/transcript/jobs/${encodeURIComponent(jobId)}/cancel`, {
          method: 'POST',
          signal: cancelController.signal,
        });
        if (!response.ok) throw new Error('CANCEL_REQUEST_FAILED');
        setNotice('Đã dừng theo dõi job và worker đã nhận yêu cầu dừng.');
      } catch {
        setNotice('Không gửi được yêu cầu dừng tới worker; đã dừng theo dõi ở trình duyệt.');
      } finally {
        window.clearTimeout(timer);
      }
    } else {
      setNotice('Đã dừng xử lý.');
    }
  };

  return {
    document,
    error,
    loading,
    progressStage,
    elapsedSeconds,
    notice,
    setNotice,
    extract,
    cancel,
    loadDocument: setDocument,
  };
};
