"""Acquire only normal public media links from the specified Wind section."""
import hashlib
import json
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SPEC = json.loads((ROOT / 'C04_MOTION_ACQUISITION.json').read_text())
OUT = ROOT / 'acquired-motion'
OUT.mkdir(exist_ok=True)
now = lambda: datetime.now(timezone.utc).isoformat()
stable = lambda url: urlunsplit((*urlsplit(url)[:3], '', ''))
report = {'sourceRevision': os.environ.get('GITHUB_SHA'), 'startedAt': now(),
          'element': 'C04', 'article': SPEC['article'], 'section': SPEC['section'],
          'scope': SPEC['limits'], 'clips': [], 'errors': [], 'formalVerdict': 'not measured'}


def fetch(url, host, limit):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != host:
        raise ValueError('Unexpected source host')
    with urlopen(Request(url, headers={'User-Agent': 'game2-comparison-research/1.0'}), timeout=25) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Response exceeds the recorded byte limit')
        return data, response.headers.get_content_type()


class WindClips(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_heading, self.heading, self.section, self.links = False, [], '', []

    def handle_starttag(self, tag, attrs):
        if tag == 'h2':
            self.in_heading, self.heading = True, []
        if self.section != SPEC['section'] or tag not in ('video', 'source'):
            return
        for key, value in attrs:
            if key not in ('src', 'data-src') or not value:
                continue
            url = urljoin(SPEC['article'], value)
            parsed = urlsplit(url)
            if parsed.scheme == 'https' and parsed.hostname == 'stream.mux.com' and parsed.path.endswith('.mp4'):
                if stable(url) not in [stable(x) for x in self.links]:
                    self.links.append(url)

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)

    def handle_endtag(self, tag):
        if tag == 'h2':
            self.section, self.in_heading = ''.join(self.heading).strip(), False


def save():
    (OUT / 'motion-acquisition-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


def safe_error(error):
    if isinstance(error, ValueError):
        return str(error)
    return type(error).__name__ + (f' HTTP {error.code}' if hasattr(error, 'code') else '')


try:
    page, mime = fetch(SPEC['article'], 'blog.playstation.com', 8 * 1024 * 1024)
    if mime != 'text/html':
        raise ValueError('Expected article HTML')
    parser = WindClips()
    parser.feed(page.decode('utf-8', errors='replace'))
    report['identifiedLinks'] = [stable(x) for x in parser.links]
    if not parser.links:
        raise ValueError('No normal MP4 media links found in the specified section')
    if len(parser.links) > SPEC['maxClips']:
        raise ValueError('More clips found than planned; inspect before broadening acquisition')
    for i, url in enumerate(parser.links, 1):
        entry = {'id': f'GT-WIND-{i:02}', 'source': stable(url)}
        try:
            data, mime = fetch(url, 'stream.mux.com', SPEC['maxBytesPerClip'])
            if mime != 'video/mp4' or data[4:8] != b'ftyp':
                raise ValueError('Expected MP4 container; full decoding still required')
            filename = f'wind-{i:02}.mp4'
            (OUT / filename).write_bytes(data)
            entry.update(status='acquired', file=filename, bytes=len(data), mime=mime,
                         sha256=hashlib.sha256(data).hexdigest(), retrievedAt=now())
        except Exception as error:
            # Do not persist source query tokens or token-bearing exception URLs.
            entry.update(status='failed', error=safe_error(error))
            report['errors'].append({'id': entry['id'], 'error': safe_error(error)})
        report['clips'].append(entry)
        save()
except Exception as error:
    report['errors'].append({'stage': 'source-section', 'error': safe_error(error)})
finally:
    report['finishedAt'] = now()
    report['result'] = 'partial_or_failed' if report['errors'] else 'acquired; full decode and content inspection pending'
    save()
    print(json.dumps(report, ensure_ascii=False))

if report['errors']:
    raise SystemExit(1)
