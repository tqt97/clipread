import threading


class Metrics:
    def __init__(self):
        self._values = {}
        self._lock = threading.Lock()

    def increment(self, name, amount=1):
        with self._lock:
            self._values[name] = self._values.get(name, 0) + amount

    def snapshot(self):
        with self._lock:
            return dict(self._values)
