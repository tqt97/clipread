import threading


class Metrics:
    def __init__(self):
        self._values = {}
        self._timings = {}
        self._lock = threading.Lock()

    def increment(self, name, amount=1):
        with self._lock:
            self._values[name] = self._values.get(name, 0) + amount

    def snapshot(self):
        with self._lock:
            return {**self._values, "timings": {name: dict(value) for name, value in self._timings.items()}}

    def observe(self, name, milliseconds):
        with self._lock:
            timing = self._timings.setdefault(name, {"count": 0, "totalMs": 0, "maxMs": 0})
            timing["count"] += 1
            timing["totalMs"] += round(milliseconds, 2)
            timing["maxMs"] = max(timing["maxMs"], round(milliseconds, 2))
