from urllib.parse import urlparse


def platform_for(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return "unknown"
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host == "youtu.be" or host == "youtube.com" or host.endswith(".youtube.com"):
        return "youtube"
    if host == "tiktok.com" or host.endswith(".tiktok.com"):
        return "tiktok"
    if host == "facebook.com" or host.endswith(".facebook.com") or host == "fb.watch":
        return "facebook"
    return "unknown"
