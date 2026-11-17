import json
import queue
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from worker.captions import parse_caption, parse_timestamped_caption
from worker.platforms import platform_for
from worker.retry_policy import RETRYABLE_JOB_ERRORS
from worker.transcriber import run_command, transcribe_with_cancel


class CaptionParserTests(unittest.TestCase):
    def test_parses_webvtt_and_removes_markup(self):
        content = """WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<c.white>Hello&nbsp;world</c>\n"""

        self.assertEqual(
            parse_caption(content, "vtt", "en"),
            [{"text": "Hello world", "duration": 2.5, "offset": 1.0, "lang": "en"}],
        )

    def test_parses_srt(self):
        content = """1\n00:00:01,000 --> 00:00:02,250\nXin chào\n\n2\n00:00:02,250 --> 00:00:04,000\nClipRead\n"""

        segments = parse_caption(content, "srt", "vi")

        self.assertEqual(segments[0]["offset"], 1.0)
        self.assertEqual(segments[0]["duration"], 1.25)
        self.assertEqual(segments[1]["text"], "ClipRead")

    def test_parses_youtube_json3(self):
        content = json.dumps({
            "events": [
                {"tStartMs": 0, "dDurationMs": 1500, "segs": [{"utf8": "Xin "}, {"utf8": "chào"}]},
            ],
        })

        self.assertEqual(
            parse_caption(content, "json3", "vi"),
            [{"text": "Xin chào", "duration": 1.5, "offset": 0.0, "lang": "vi"}],
        )

    def test_empty_or_unsupported_caption_can_fall_back(self):
        self.assertEqual(parse_timestamped_caption("not a caption", "en"), [])
        self.assertEqual(parse_caption("<xml></xml>", "unknown", "en"), [])

    def test_platform_allowlist(self):
        self.assertEqual(platform_for("https://www.tiktok.com/@demo/video/1"), "tiktok")
        self.assertEqual(platform_for("https://www.facebook.com/reel/1"), "facebook")
        self.assertEqual(platform_for("https://evil-youtube.com/video/1"), "unknown")
        self.assertEqual(platform_for("file://youtube.com/video/1"), "unknown")

    def test_parses_short_webvtt_timestamp(self):
        content = """WEBVTT\n\n00:01.000 --> 00:03.500\nShort timestamp\n"""

        self.assertEqual(parse_caption(content, "vtt", "en")[0]["duration"], 2.5)

    def test_upstream_rate_limit_is_not_retried_blindly(self):
        self.assertNotIn("UPSTREAM_RATE_LIMITED", RETRYABLE_JOB_ERRORS)

    def test_command_reads_large_stderr_without_deadlocking(self):
        with TemporaryDirectory() as directory:
            script = Path(directory) / "emit.py"
            script.write_text("import sys; sys.stderr.write('x' * 2000000); print('ok')")
            output = run_command(["python3", str(script)])
        self.assertEqual(output.strip(), "ok")

    def test_whisper_queue_failure_is_a_worker_error(self):
        with patch("worker.transcriber.Process") as process_class, patch("worker.transcriber.Queue") as queue_class:
            process = process_class.return_value
            process.is_alive.return_value = False
            process.exitcode = 1
            queue_class.return_value.get.side_effect = queue.Empty
            with self.assertRaises(Exception) as context:
                transcribe_with_cancel("audio.wav", "vi", "base")
        self.assertEqual(getattr(context.exception, "code", None), "WHISPER_FAILED")


if __name__ == "__main__":
    unittest.main()
