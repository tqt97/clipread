import unittest
from tempfile import TemporaryDirectory

from worker.errors import WorkerError
from worker.job_store import JobStore
from worker.rate_limiter import RateLimiter
from worker.metrics import Metrics


class JobStoreTests(unittest.TestCase):
    def test_limits_pending_jobs(self):
        store = JobStore(max_pending=1)
        store.create()

        with self.assertRaises(WorkerError) as context:
            store.create()

        self.assertEqual(context.exception.code, "QUEUE_FULL")

    def test_removes_expired_terminal_jobs(self):
        store = JobStore(ttl_seconds=0)
        job = store.create()
        store.update(job["jobId"], status="completed")

        self.assertIsNone(store.get(job["jobId"]))

    def test_persists_job_state_across_store_instances(self):
        with TemporaryDirectory() as directory:
            path = f"{directory}/jobs.sqlite3"
            first_store = JobStore(db_path=path)
            job = first_store.create("https://www.youtube.com/watch?v=demo", "vi")
            first_store.update(job["jobId"], status="completed", stage="completed")
            first_store.close()

            second_store = JobStore(db_path=path)
            restored = second_store.get(job["jobId"])
            second_store.close()

        self.assertEqual(restored["status"], "completed")

    def test_pending_jobs_include_source_for_recovery(self):
        store = JobStore()
        job = store.create("https://www.youtube.com/watch?v=demo", "en")

        self.assertEqual(
            store.pending_jobs(),
            [{"jobId": job["jobId"], "url": "https://www.youtube.com/watch?v=demo", "language": "en", "attempt": 1}],
        )

    def test_create_is_idempotent_for_an_active_or_completed_job(self):
        store = JobStore()
        first = store.create("https://www.youtube.com/watch?v=demo", "vi")
        duplicate = store.create("https://www.youtube.com/watch?v=demo", "vi")
        store.update(first["jobId"], status="completed", stage="completed")
        completed_duplicate = store.create("https://www.youtube.com/watch?v=demo", "vi")

        self.assertEqual(duplicate["jobId"], first["jobId"])
        self.assertEqual(completed_duplicate["jobId"], first["jobId"])

    def test_cancel_marks_job_without_deleting_history(self):
        store = JobStore()
        job = store.create("https://www.youtube.com/watch?v=cancel", "auto")
        cancelled = store.request_cancel(job["jobId"])

        self.assertEqual(cancelled["status"], "cancelled")
        self.assertTrue(store.is_cancel_requested(job["jobId"]))
        self.assertEqual(store.get(job["jobId"])["jobId"], job["jobId"])

    def test_stale_running_job_is_requeued(self):
        store = JobStore()
        job = store.create("https://www.youtube.com/watch?v=stale", "auto")
        store.update(job["jobId"], status="running", heartbeatAt=0)

        recovered = store.recover_stale(stale_seconds=1)

        self.assertEqual(recovered[0]["jobId"], job["jobId"])
        self.assertEqual(store.get(job["jobId"])["status"], "queued")

    def test_backup_contains_job_state(self):
        with TemporaryDirectory() as directory:
            source = f"{directory}/jobs.sqlite3"
            target = f"{directory}/backup.sqlite3"
            store = JobStore(db_path=source)
            job = store.create("https://www.youtube.com/watch?v=backup", "auto")
            store.backup(target)
            restored_store = JobStore(db_path=target)
            restored = restored_store.get(job["jobId"])
            self.assertEqual(restored["jobId"], job["jobId"])
            restored_store.close()
            store.close()

    def test_lease_prevents_two_workers_claiming_same_job(self):
        store = JobStore()
        job = store.create()
        self.assertTrue(store.claim(job["jobId"], "worker-a", lease_seconds=60))
        self.assertFalse(store.claim(job["jobId"], "worker-b", lease_seconds=60))
        store.close()

    def test_fenced_update_rejects_stale_worker(self):
        store = JobStore()
        job = store.create()
        self.assertTrue(store.claim(job["jobId"], "worker-a", lease_seconds=60))
        self.assertFalse(store.update(job["jobId"], lease_token="worker-b", status="completed"))
        self.assertTrue(store.update(job["jobId"], lease_token="worker-a", status="completed"))
        self.assertEqual(store.get(job["jobId"])["status"], "completed")

    def test_cancelled_job_is_not_requeued_after_restart(self):
        store = JobStore()
        job = store.create()
        cancelled = store.request_cancel(job["jobId"])
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(store.pending_jobs(), [])

    def test_recovery_preserves_attempt_and_recovers_cancel_requested(self):
        store = JobStore()
        job = store.create()
        store.update(job["jobId"], attempt=2, status="running", heartbeatAt=0)
        recovered = store.recover_stale(stale_seconds=1)
        self.assertEqual(recovered[0]["attempt"], 2)
        cancel_job = store.create("https://example.com/cancel", "auto")
        store.update(cancel_job["jobId"], status="running", heartbeatAt=0)
        store.request_cancel(cancel_job["jobId"])
        store.recover_stale(stale_seconds=1)
        self.assertEqual(recovered[0], {"jobId": job["jobId"], "url": "", "language": "auto", "attempt": 2})
        self.assertEqual(store.get(cancel_job["jobId"])["status"], "cancelled")


class RateLimiterTests(unittest.TestCase):
    def test_allows_limit_and_releases_events_after_window(self):
        limiter = RateLimiter(limit=2, window_seconds=10)

        self.assertTrue(limiter.allow("client", now=100))
        self.assertTrue(limiter.allow("client", now=101))
        self.assertFalse(limiter.allow("client", now=102))
        self.assertTrue(limiter.allow("client", now=111))


class MetricsTests(unittest.TestCase):
    def test_snapshot_is_a_copy_of_counters(self):
        metrics = Metrics()
        metrics.increment("jobs_started")
        metrics.increment("jobs_started", 2)

        snapshot = metrics.snapshot()
        snapshot["jobs_started"] = 0

        self.assertEqual(metrics.snapshot()["jobs_started"], 3)


if __name__ == "__main__":
    unittest.main()
