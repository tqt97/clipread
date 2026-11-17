import time
from collections import defaultdict, deque
from threading import Lock


class RateLimiter:
    def __init__(self, limit, window_seconds):
        self._limit = limit
        self._window_seconds = window_seconds
        self._events = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key, now=None):
        current_time = time.time() if now is None else now
        cutoff = current_time - self._window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self._limit:
                return False
            events.append(current_time)
            return True
