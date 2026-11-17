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
            [{"jobId": job["jobId"], "url": "https://www.youtube.com/watch?v=demo", "language": "en"}],
        )

    def test_create_is_idempotent_for_an_active_or_completed_job(self):
        store = JobStore()
        first = store.create("https://www.youtube.com/watch?v=demo", "vi")
        duplicate = store.create("https://www.youtube.com/watch?v=demo", "vi")
        store.update(first["jobId"], status="completed", stage="completed")
        completed_duplicate = store.create("https://www.youtube.com/watch?v=demo", "vi")

        self.assertEqual(duplicate["jobId"], first["jobId"])
        self.assertEqual(completed_duplicate["jobId"], first["jobId"])


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
