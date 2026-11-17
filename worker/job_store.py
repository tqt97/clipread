import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from .errors import WorkerError


class JobStore:
    """SQLite-backed job state with a small interface for the worker server."""

    def __init__(self, ttl_seconds=3600, max_jobs=100, max_pending=2, db_path=":memory:"):
        self._ttl_seconds = ttl_seconds
        self._max_jobs = max_jobs
        self._max_pending = max_pending
        self._lock = threading.Lock()
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(db_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA busy_timeout = 5000")
        if db_path != ":memory:":
            self._connection.execute("PRAGMA journal_mode = WAL")
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                source_url TEXT NOT NULL,
                language TEXT NOT NULL,
                status TEXT NOT NULL,
                stage TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        self._connection.commit()

    def _cleanup_locked(self):
        now = time.time()
        self._connection.execute(
            "DELETE FROM jobs WHERE status IN ('completed', 'failed') AND ? - created_at > ?",
            (now, self._ttl_seconds),
        )
        rows = self._connection.execute(
            "SELECT job_id FROM jobs WHERE status IN ('completed', 'failed') ORDER BY created_at ASC"
        ).fetchall()
        total = self._connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        for row in rows[: max(0, total - self._max_jobs)]:
            self._connection.execute("DELETE FROM jobs WHERE job_id = ?", (row["job_id"],))

    @staticmethod
    def _public(data):
        return {key: value for key, value in data.items() if not key.startswith("_")}

    @staticmethod
    def _decode(row):
        return json.loads(row["data"])

    def create(self, source_url="", language="auto"):
        with self._lock:
            self._cleanup_locked()
            existing = None
            if source_url:
                existing = self._connection.execute(
                    "SELECT data FROM jobs WHERE source_url = ? AND language = ? "
                    "AND status IN ('queued', 'running', 'completed') ORDER BY created_at DESC LIMIT 1",
                    (source_url, language),
                ).fetchone()
            if existing:
                return self._public(self._decode(existing))
            pending = self._connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued', 'running')"
            ).fetchone()[0]
            if pending >= self._max_pending:
                raise WorkerError("QUEUE_FULL", "Worker đang bận, vui lòng thử lại sau.")
            job_id = uuid.uuid4().hex
            now = time.time()
            data = {"jobId": job_id, "status": "queued", "stage": "queued"}
            self._connection.execute(
                "INSERT INTO jobs(job_id, source_url, language, status, stage, data, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (job_id, source_url, language, "queued", "queued", json.dumps(data), now, now),
            )
            self._connection.commit()
            return self._public(data)

    def update(self, job_id, **values):
        with self._lock:
            row = self._connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return
            data = self._decode(row)
            data.update(values)
            status = data.get("status", row["status"])
            stage = data.get("stage", row["stage"])
            self._connection.execute(
                "UPDATE jobs SET status = ?, stage = ?, data = ?, updated_at = ? WHERE job_id = ?",
                (status, stage, json.dumps(data, ensure_ascii=False), time.time(), job_id),
            )
            self._connection.commit()

    def get(self, job_id):
        with self._lock:
            self._cleanup_locked()
            row = self._connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            self._connection.commit()
            return self._public(self._decode(row)) if row else None

    def pending_jobs(self):
        with self._lock:
            rows = self._connection.execute(
                "SELECT job_id, source_url, language FROM jobs WHERE status IN ('queued', 'running') "
                "ORDER BY created_at ASC"
            ).fetchall()
            return [
                {"jobId": row["job_id"], "url": row["source_url"], "language": row["language"]}
                for row in rows
            ]

    def close(self):
        with self._lock:
            self._connection.close()
