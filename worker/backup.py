#!/usr/bin/env python3
"""Tạo bản sao nhất quán cho SQLite job store."""
import os
import sys

from .job_store import JobStore


def main():
    source = os.getenv("JOB_DB_PATH", "worker/data/jobs.sqlite3")
    destination = sys.argv[1] if len(sys.argv) > 1 else f"{source}.backup"
    store = JobStore(db_path=source)
    try:
        store.backup(destination)
    finally:
        store.close()
    print(f"Đã backup job store: {destination}")


if __name__ == "__main__":
    main()
