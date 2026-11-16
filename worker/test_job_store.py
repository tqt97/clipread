import unittest

from worker.errors import WorkerError
from worker.job_store import JobStore


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


if __name__ == "__main__":
    unittest.main()
