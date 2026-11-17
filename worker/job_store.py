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
        self._migrate()
        self._connection.commit()

    def _migrate(self):
        columns = {row[1] for row in self._connection.execute("PRAGMA table_info(jobs)").fetchall()}
        for name, definition in {
            "attempt": "INTEGER NOT NULL DEFAULT 1",
            "deadline_at": "REAL",
            "heartbeat_at": "REAL",
            "cancel_requested": "INTEGER NOT NULL DEFAULT 0",
            "dead_letter": "INTEGER NOT NULL DEFAULT 0",
            "lease_token": "TEXT",
            "lease_expires_at": "REAL",
        }.items():
            if name not in columns:
                self._connection.execute(f"ALTER TABLE jobs ADD COLUMN {name} {definition}")

    def _cleanup_locked(self):
        now = time.time()
        self._connection.execute(
            "DELETE FROM jobs WHERE status IN ('completed', 'failed', 'dead_letter', 'cancelled') AND ? - created_at > ?",
            (now, self._ttl_seconds),
        )
        rows = self._connection.execute(
            "SELECT job_id FROM jobs WHERE status IN ('completed', 'failed', 'dead_letter', 'cancelled') ORDER BY created_at ASC"
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
            data = {"jobId": job_id, "status": "queued", "stage": "queued", "attempt": 1, "cancelRequested": False}
            self._connection.execute(
                "INSERT INTO jobs(job_id, source_url, language, status, stage, data, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (job_id, source_url, language, "queued", "queued", json.dumps(data), now, now),
            )
            self._connection.commit()
            return self._public(data)

    def update(self, job_id, lease_token=None, **values):
        with self._lock:
            row = self._connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return
            data = self._decode(row)
            data.update(values)
            status = data.get("status", row["status"])
            stage = data.get("stage", row["stage"])
            where = " WHERE job_id = ?" + (" AND lease_token = ?" if lease_token else "")
            parameters = (
                status, stage, json.dumps(data, ensure_ascii=False), time.time(),
                values.get("heartbeatAt", time.time() if status == "running" else row["heartbeat_at"]),
                values.get("deadlineAt", row["deadline_at"]),
                int(data.get("cancelRequested", bool(row["cancel_requested"]))),
                int(data.get("attempt", row["attempt"])),
                int(data.get("deadLetter", bool(row["dead_letter"]))),
            )
            cursor = self._connection.execute(
                "UPDATE jobs SET status = ?, stage = ?, data = ?, updated_at = ?, heartbeat_at = ?, "
                "deadline_at = ?, cancel_requested = ?, attempt = ?, dead_letter = ?, "
                "lease_token = CASE WHEN ? IN ('queued','completed','failed','cancelled','dead_letter') THEN NULL ELSE lease_token END, "
                "lease_expires_at = CASE WHEN ? IN ('queued','completed','failed','cancelled','dead_letter') THEN NULL ELSE lease_expires_at END" + where,
                parameters + (status, status, job_id) + ((lease_token,) if lease_token else ()),
            )
            self._connection.commit()
            return cursor.rowcount == 1

    def get(self, job_id):
        with self._lock:
            self._cleanup_locked()
            row = self._connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            self._connection.commit()
            return self._public(self._decode(row)) if row else None

    def pending_jobs(self):
        with self._lock:
            rows = self._connection.execute(
                "SELECT job_id, source_url, language, attempt FROM jobs WHERE status IN ('queued', 'running') "
                "ORDER BY created_at ASC"
            ).fetchall()
            return [
                {"jobId": row["job_id"], "url": row["source_url"], "language": row["language"], "attempt": row["attempt"]}
                for row in rows
            ]

    def request_cancel(self, job_id):
        with self._lock:
            row = self._connection.execute("SELECT data, status FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return None
            data = self._decode(row)
            if row["status"] == "queued":
                data.update({"cancelRequested": True, "status": "cancelled", "stage": "cancelled"})
                self._connection.execute(
                    "UPDATE jobs SET status='cancelled', stage='cancelled', cancel_requested=1, data=?, updated_at=? WHERE job_id=?",
                    (json.dumps(data, ensure_ascii=False), time.time(), job_id),
                )
                self._connection.commit()
            elif row["status"] == "running":
                data.update({"cancelRequested": True, "status": "cancel_requested", "stage": "cancel_requested"})
                self._connection.execute(
                    "UPDATE jobs SET status='cancel_requested', stage='cancel_requested', cancel_requested=1, data=?, updated_at=? WHERE job_id=?",
                    (json.dumps(data, ensure_ascii=False), time.time(), job_id),
                )
                self._connection.commit()
            return self._public(data)

    def is_cancel_requested(self, job_id):
        with self._lock:
            row = self._connection.execute("SELECT cancel_requested FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            return bool(row and row[0])

    def heartbeat(self, job_id, token=None, lease_seconds=30):
        with self._lock:
            now = time.time()
            if token:
                self._connection.execute("UPDATE jobs SET heartbeat_at=?, lease_expires_at=?, updated_at=? WHERE job_id=? AND lease_token=?", (now, now + lease_seconds, now, job_id, token))
            else:
                self._connection.execute("UPDATE jobs SET heartbeat_at=?, updated_at=? WHERE job_id=?", (now, now, job_id))
            self._connection.commit()

    def claim(self, job_id, token, lease_seconds=30):
        with self._lock:
            row = self._connection.execute("SELECT status, lease_token, lease_expires_at FROM jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row or row["status"] in ("completed", "failed", "cancel_requested", "cancelled", "dead_letter") or (
                row["lease_token"] and row["lease_expires_at"] and row["lease_expires_at"] > time.time() and row["lease_token"] != token
            ):
                return False
            now = time.time()
            self._connection.execute("UPDATE jobs SET status='running', lease_token=?, lease_expires_at=?, heartbeat_at=?, updated_at=? WHERE job_id=?", (token, now + lease_seconds, now, now, job_id))
            self._connection.commit()
            return True

    def recover_stale(self, stale_seconds=120):
        threshold = time.time() - stale_seconds
        with self._lock:
            rows = self._connection.execute(
                "SELECT job_id, source_url, language, attempt, data, status FROM jobs WHERE status IN ('queued','running','cancel_requested') "
                "AND COALESCE(heartbeat_at, updated_at) < ?", (threshold,)
            ).fetchall()
            for row in rows:
                data = self._decode(row)
                next_status = "cancelled" if row["status"] == "cancel_requested" else "queued"
                data.update({"status": next_status, "stage": next_status})
                self._connection.execute("UPDATE jobs SET status=?, stage=?, data=?, updated_at=?, heartbeat_at=?, lease_token=NULL, lease_expires_at=NULL WHERE job_id=?", (next_status, next_status, json.dumps(data, ensure_ascii=False), time.time(), time.time(), row["job_id"]))
            self._connection.commit()
            return [{"jobId": r["job_id"], "url": r["source_url"], "language": r["language"], "attempt": r["attempt"]} for r in rows if r["status"] != "cancel_requested"]

    def mark_dead_letter(self, job_id, error, code):
        self.update(job_id, status="dead_letter", stage="dead_letter", error=error, code=code, deadLetter=True)

    def backup(self, output_path):
        with self._lock:
            destination = sqlite3.connect(output_path)
            try:
                self._connection.backup(destination)
            finally:
                destination.close()

    def close(self):
        with self._lock:
            self._connection.close()
