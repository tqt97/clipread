export type TranscriptApiErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'PROVIDER_NOT_READY'
  | 'TRANSCRIPT_NOT_FOUND'
  | 'YOUTUBE_RATE_LIMITED'
  | 'YOUTUBE_TIMEOUT'
  | 'WORKER_RATE_LIMITED'
  | 'VIDEO_UNAVAILABLE'
  | 'INVALID_LANGUAGE'
  | 'WORKER_UNAVAILABLE'
  | 'WORKER_UNAUTHORIZED'
  | 'VIDEO_TOO_LONG'
  | 'JOB_NOT_FOUND'
  | 'QUEUE_FULL'
  | 'UPSTREAM_ERROR';

export interface TranscriptApiError {
  error: string;
  code: TranscriptApiErrorCode;
}

export const apiError = (code: TranscriptApiErrorCode, error: string): TranscriptApiError => ({ code, error });

export interface TranscriptErrorPresentation {
  title: string;
  message: string;
  retryable: boolean;
}

export const presentTranscriptError = (
  code?: string,
  kind: 'network' | 'timeout' | 'unknown' = 'unknown',
): TranscriptErrorPresentation => {
  if (kind === 'network')
    return {
      title: 'Không kết nối được',
      message: 'Không thể kết nối tới ClipRead. Hãy kiểm tra mạng hoặc thử lại sau.',
      retryable: true,
    };
  if (kind === 'timeout')
    return {
      title: 'Xử lý mất nhiều thời gian',
      message: 'Worker chưa hoàn tất trong thời gian cho phép. Hãy thử lại với video ngắn hơn.',
      retryable: true,
    };

  const messages: Record<string, TranscriptErrorPresentation> = {
    INVALID_REQUEST: {
      title: 'Yêu cầu chưa hợp lệ',
      message: 'Dữ liệu gửi lên chưa đúng. Hãy kiểm tra lại đường dẫn video.',
      retryable: false,
    },
    INVALID_URL: {
      title: 'Đường dẫn chưa hợp lệ',
      message: 'Hãy nhập một đường dẫn HTTP hoặc HTTPS đầy đủ.',
      retryable: false,
    },
    UNSUPPORTED_PLATFORM: {
      title: 'Chưa hỗ trợ nền tảng này',
      message: 'ClipRead hiện hỗ trợ YouTube, TikTok và Facebook ở mức MVP.',
      retryable: false,
    },
    PROVIDER_NOT_READY: {
      title: 'Nền tảng chưa được bật',
      message: 'Nền tảng đã nhận diện nhưng worker chưa được cấu hình. Hãy bật worker rồi thử lại.',
      retryable: false,
    },
    TRANSCRIPT_NOT_FOUND: {
      title: 'Không tìm thấy transcript',
      message: 'Video chưa có caption và worker Whisper chưa sẵn sàng để chuyển audio thành văn bản.',
      retryable: false,
    },
    NO_TRANSCRIPT: {
      title: 'Không tạo được transcript',
      message: 'Caption và audio đều chưa tạo được văn bản. Hãy thử video khác hoặc kiểm tra worker Whisper.',
      retryable: false,
    },
    YOUTUBE_RATE_LIMITED: {
      title: 'YouTube đang giới hạn truy cập',
      message: 'Hãy cấu hình worker riêng hoặc chờ một lúc rồi thử lại.',
      retryable: true,
    },
    YOUTUBE_TIMEOUT: {
      title: 'YouTube phản hồi quá lâu',
      message: 'Không nhận được transcript trong thời gian cho phép. Hãy thử lại hoặc dùng worker riêng.',
      retryable: true,
    },
    VIDEO_UNAVAILABLE: {
      title: 'Video không khả dụng',
      message: 'Video có thể đã bị gỡ, giới hạn quyền xem hoặc không còn public.',
      retryable: false,
    },
    INVALID_LANGUAGE: {
      title: 'Ngôn ngữ chưa hợp lệ',
      message: 'Hãy chọn lại ngôn ngữ transcript rồi thử lại.',
      retryable: false,
    },
    WORKER_UNAVAILABLE: {
      title: 'Worker đang không khả dụng',
      message: 'Không kết nối được tới worker xử lý video. Hãy kiểm tra worker hoặc thử lại sau.',
      retryable: true,
    },
    WORKER_UNAUTHORIZED: {
      title: 'Worker chưa được xác thực',
      message: 'Token giữa Vercel và worker không khớp. Hãy kiểm tra cấu hình môi trường.',
      retryable: false,
    },
    WORKER_RATE_LIMITED: {
      title: 'Worker đang giới hạn yêu cầu',
      message: 'Có quá nhiều yêu cầu trong thời gian ngắn. Hãy đợi một lát rồi thử lại.',
      retryable: true,
    },
    VIDEO_TOO_LONG: {
      title: 'Video quá dài',
      message: 'Video vượt quá giới hạn xử lý hiện tại. Hãy thử một video ngắn hơn.',
      retryable: false,
    },
    JOB_NOT_FOUND: {
      title: 'Job không còn tồn tại',
      message: 'Job xử lý đã hết hạn hoặc bị mất. Hãy tạo lại yêu cầu.',
      retryable: true,
    },
    QUEUE_FULL: {
      title: 'Worker đang quá tải',
      message: 'Có quá nhiều video đang chờ xử lý. Hãy thử lại sau ít phút.',
      retryable: true,
    },
    REQUEST_TOO_LARGE: {
      title: 'Yêu cầu quá lớn',
      message: 'Thông tin gửi tới worker vượt giới hạn cho phép.',
      retryable: false,
    },
    INVALID_UPSTREAM_RESPONSE: {
      title: 'Nguồn video trả dữ liệu lỗi',
      message: 'Nền tảng video trả về dữ liệu không hợp lệ. Hãy thử lại sau.',
      retryable: true,
    },
    UPSTREAM_COMMAND_FAILED: {
      title: 'Không lấy được audio/video',
      message: 'Worker không thể đọc nguồn video. Hãy kiểm tra link còn public rồi thử lại.',
      retryable: true,
    },
    WORKER_ERROR: {
      title: 'Worker gặp lỗi',
      message: 'Worker gặp lỗi khi xử lý video. Hãy thử lại hoặc kiểm tra log của worker.',
      retryable: true,
    },
    UPSTREAM_ERROR: {
      title: 'Nguồn video chưa phản hồi',
      message: 'Nền tảng video đang lỗi hoặc giới hạn request. Hãy thử lại sau.',
      retryable: true,
    },
  };
  return messages[code || ''] || messages.UPSTREAM_ERROR;
};
