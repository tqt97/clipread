import threading
import time
import uuid

from .errors import WorkerError


class JobStore:
    def __init__(self, ttl_seconds=3600, max_jobs=100, max_pending=2):
        self._jobs = {}
        self._lock = threading.Lock()
        self._ttl_seconds = ttl_seconds
        self._max_jobs = max_jobs
        self._max_pending = max_pending

    def _cleanup_locked(self):
        now = time.time()
        expired = [
            job_id for job_id, job in self._jobs.items()
            if job.get("status") in ("completed", "failed")
            and now - job.get("_created_at", now) > self._ttl_seconds
        ]
        for job_id in expired:
            del self._jobs[job_id]

        if len(self._jobs) <= self._max_jobs:
            return
        terminal_jobs = sorted(
            (job.get("_created_at", 0), job_id)
            for job_id, job in self._jobs.items()
            if job.get("status") in ("completed", "failed")
        )
        for _, job_id in terminal_jobs[:len(self._jobs) - self._max_jobs]:
            del self._jobs[job_id]

    @staticmethod
    def _public(job):
        return {key: value for key, value in job.items() if not key.startswith("_")}

    def create(self):
        with self._lock:
            self._cleanup_locked()
            pending = sum(job.get("status") in ("queued", "running") for job in self._jobs.values())
            if pending >= self._max_pending:
                raise WorkerError("QUEUE_FULL", "Worker đang bận, vui lòng thử lại sau.")
            job_id = uuid.uuid4().hex
            self._jobs[job_id] = {
                "jobId": job_id,
                "status": "queued",
                "stage": "queued",
                "_created_at": time.time(),
            }
            return self._public(self._jobs[job_id])

    def update(self, job_id, **values):
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(values)

    def get(self, job_id):
        with self._lock:
            self._cleanup_locked()
            job = self._jobs.get(job_id)
            return self._public(job) if job else None
