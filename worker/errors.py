class WorkerError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class JobCancelled(WorkerError):
    def __init__(self):
        super().__init__("JOB_CANCELLED", "Job đã được dừng theo yêu cầu.")


class JobDeadlineExceeded(WorkerError):
    def __init__(self):
        super().__init__("JOB_TIMEOUT", "Job đã vượt quá thời gian xử lý cho phép.")
