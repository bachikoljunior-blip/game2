"""Bounded acquisition of comparison-only material; no runtime or verdict writes."""
import hashlib
import json
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SPEC = json.loads((ROOT / "C04_ACQUISITION.json").read_text())
OUT = ROOT / "acquired"
OUT.mkdir(exist_ok=True)
MAX_BYTES = 8 * 1024 * 1024
REPORT = {
    "sourceRevision": os.environ.get("GITHUB_SHA"),
    "startedAt": datetime.now(timezone.utc).isoformat(),
    "kind": "actual reference acquisition, not a quality verdict",
    "element": "C04",
    "materials": [],
    "pageMedia": [],
    "errors": [],
    "formalVerdict": "not measured",
}


def fetch(url):
    if urlparse(url).scheme != "https" or urlparse(url).hostname != "blog.playstation.com":
        raise ValueError("Only the fixed official source host is allowed")
    with urlopen(Request(url, headers={"User-Agent": "game2-comparison-research/1.0"}), timeout=25) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Response exceeds acquisition byte limit")
        return data, response.geturl(), response.headers.get_content_type()


class MediaLinks(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links = base, set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("src", "data-src", "href"):
            url = urljoin(self.base, a.get(key, ""))
            if urlparse(url).scheme != "https":
                continue
            path = urlparse(url).path.lower()
            if tag in ("video", "source", "iframe") or path.endswith((".mp4", ".webm", ".gif")):
                self.links.add(url)


def save_report():
    (OUT / "acquisition-report.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n")


try:
    for item in SPEC["materials"]:
        entry = {"id": item["id"], "url": item["url"], "article": item["article"], "scope": item["scope"]}
        try:
            data, final_url, mime = fetch(item["url"])
            if mime != "image/jpeg" or not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
                raise ValueError("Expected a complete JPEG response; actual pixel decode is separate")
            filename = item["file"]
            if Path(filename).name != filename:
                raise ValueError("Expected a plain filename")
            (OUT / filename).write_bytes(data)
            entry.update(status="acquired", file=filename, bytes=len(data), mime=mime, finalUrl=final_url,
                         sha256=hashlib.sha256(data).hexdigest(), retrievedAt=datetime.now(timezone.utc).isoformat())
        except Exception as error:
            entry.update(status="failed", error=str(error))
            REPORT["errors"].append({"id": item["id"], "error": str(error)})
        REPORT["materials"].append(entry)
        save_report()

    for article in dict.fromkeys(item["article"] for item in SPEC["materials"]):
        try:
            data, final_url, mime = fetch(article)
            if mime != "text/html":
                raise ValueError("Expected article HTML")
            parser = MediaLinks(final_url)
            parser.feed(data.decode("utf-8", errors="replace"))
            REPORT["pageMedia"].append({"article": article, "status": "read", "mediaLinks": sorted(parser.links)})
        except Exception as error:
            REPORT["pageMedia"].append({"article": article, "status": "failed", "error": str(error)})
        save_report()
finally:
    REPORT["finishedAt"] = datetime.now(timezone.utc).isoformat()
    REPORT["result"] = "partial" if REPORT["errors"] else "acquired; pixel inspection pending"
    save_report()
    print(json.dumps(REPORT, ensure_ascii=False))

if REPORT["errors"]:
    raise SystemExit(1)
