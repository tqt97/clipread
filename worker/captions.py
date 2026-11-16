import html
import ipaddress
import json
import re
import socket
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .errors import WorkerError


def caption_extension(entry):
    return (entry.get("ext") or entry.get("name") or "").lower()


def caption_priority(entry):
    return {"vtt": 0, "webvtt": 0, "srt": 1, "ttml": 2, "json": 3, "json3": 3}.get(caption_extension(entry), 9)


def caption_candidates(info, language):
    requested = None if not language or language == "auto" else language
    candidates = []
    for collection_name in ("subtitles", "automatic_captions"):
        collection = info.get(collection_name) or {}
        keys = [requested] if requested in collection else list(collection)
        for key in keys:
            if not key:
                continue
            entries = sorted(collection.get(key) or [], key=caption_priority)
            candidates.extend((key, entry) for entry in entries if entry.get("data") or entry.get("url"))
    return candidates


def parse_timestamp(value):
    parts = value.replace(",", ".").strip().split(":")
    try:
        if len(parts) == 2:
            minutes, seconds = parts
            return float(minutes) * 60 + float(seconds)
        hours, minutes, seconds = parts
        return float(hours) * 3600 + float(minutes) * 60 + float(seconds)
    except ValueError as error:
        raise WorkerError("INVALID_CAPTION", "Timestamp caption không hợp lệ.") from error


def clean_caption_text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value))).strip()


def make_segment(text, start, end, language):
    text = clean_caption_text(text)
    if not text:
        return None
    return {"text": text, "duration": max(0, end - start), "offset": start, "lang": language}


def parse_timestamped_caption(content, language):
    lines = content.replace("\r\n", "\n").split("\n")
    segments = []
    index = 0
    while index < len(lines):
        match = re.match(r"^\s*((?:\d+:)?\d{1,2}:\d{2}[,.]\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[,.]\d{3})", lines[index])
        if not match:
            index += 1
            continue
        start = parse_timestamp(match.group(1))
        end = parse_timestamp(match.group(2))
        index += 1
        text_lines = []
        while index < len(lines) and lines[index].strip():
            if not lines[index].startswith("NOTE"):
                text_lines.append(lines[index])
            index += 1
        segment = make_segment(" ".join(text_lines), start, end, language)
        if segment and (not segments or segments[-1]["text"] != segment["text"]):
            segments.append(segment)
        index += 1
    return segments


def parse_json_caption(content, language):
    payload = json.loads(content)
    events = payload.get("events", []) if isinstance(payload, dict) else []
    segments = []
    for event in events:
        text = "".join(part.get("utf8", "") for part in event.get("segs", []) if isinstance(part, dict))
        start = float(event.get("tStartMs", 0)) / 1000
        end = start + float(event.get("dDurationMs", 0)) / 1000
        segment = make_segment(text, start, end, language)
        if segment:
            segments.append(segment)
    if isinstance(payload, dict) and payload.get("utterances"):
        segments = []
        for utterance in payload["utterances"]:
            start = float(utterance.get("start_time", 0)) / 1000
            end = float(utterance.get("end_time", start * 1000)) / 1000
            segment = make_segment(utterance.get("text", ""), start, end, language)
            if segment:
                segments.append(segment)
    return segments


def parse_ttml_caption(content, language):
    segments = []
    pattern = re.compile(r"<p\b[^>]*?begin=[\"']([^\"']+)[\"'][^>]*?end=[\"']([^\"']+)[\"'][^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
    for match in pattern.finditer(content):
        segment = make_segment(match.group(3), parse_timestamp(match.group(1)), parse_timestamp(match.group(2)), language)
        if segment:
            segments.append(segment)
    return segments


def parse_caption(content, extension, language):
    extension = (extension or "vtt").lower()
    if extension in ("json", "json3"):
        return parse_json_caption(content, language)
    if extension == "ttml":
        return parse_ttml_caption(content, language)
    return parse_timestamped_caption(content, language)


def validate_public_url(value, source_url=None):
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise WorkerError("INVALID_CAPTION_URL", "Caption URL không hợp lệ.")
    host = parsed.hostname.lower().removeprefix("www.")
    if source_url:
        source_host = (urlparse(source_url).hostname or "").lower().removeprefix("www.")
        trusted_suffixes = (
            "googlevideo.com", "googleusercontent.com", "fbcdn.net", "fbsbx.com",
            "tiktokcdn.com", "tiktokv.com",
        )
        same_source = host == source_host or host.endswith(f".{source_host}") or source_host.endswith(f".{host}")
        trusted_cdn = any(host == suffix or host.endswith(f".{suffix}") for suffix in trusted_suffixes)
        if not same_source and not trusted_cdn:
            raise WorkerError("BLOCKED_CAPTION_URL", "Caption URL không thuộc nguồn video được phép.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise WorkerError("BLOCKED_CAPTION_URL", "Caption URL trỏ tới mạng nội bộ.")
    except socket.gaierror as error:
        raise WorkerError("INVALID_CAPTION_URL", "Không phân giải được caption URL.") from error


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, source_url=None):
        super().__init__()
        self.source_url = source_url

    def redirect_request(self, request, file, code, msg, headers, newurl):
        validate_public_url(newurl, self.source_url)
        return super().redirect_request(request, file, code, msg, headers, newurl)


def fetch_caption(entry, max_bytes=5 * 1024 * 1024, source_url=None):
    if entry.get("data"):
        return entry["data"]
    validate_public_url(entry["url"], source_url)
    request = Request(entry["url"], headers={"User-Agent": "ClipRead/0.1"})
    with build_opener(SafeRedirectHandler(source_url)).open(request, timeout=30) as response:
        content = response.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise WorkerError("CAPTION_TOO_LARGE", "Caption vượt quá giới hạn cho phép.")
    return content.decode("utf-8", errors="replace")
