"""Read back owned native CI media through ordinary authenticated job logs.

This preserves original bytes. It does not render, grade or publish game assets.
Only the explicitly selected game-evidence directories and suffixes are read.
"""
from pathlib import Path
import base64
import hashlib
import io
import json
import os
import sys
import zipfile

group = sys.argv[1]
prefix = ''
root = Path('AI_DEVELOPMENT/EVIDENCE')
if group in {'before', 'after'}:
    root /= 'fresh-20260915-art/' + group
    prefix = group + '/'
    allowed = {'report.json'} | {f'{actor}-{view}.png' for actor in ['player', 'sentinel', 'retainer', 'warden'] for view in ['full', 'back', 'face-front', 'face-threequarter', 'face-profile']}
    allowed |= {f'player-{state}-neck-{side}.png' for state in ['broken', 'dead', 'victory', 'stagger'] for side in ['front', 'back']} | {'warden-face-profile-left.png'}
elif group == 'vegetation':
    root /= 'fresh-20260915-art/vegetation'
    lengths = {'maple': 144, 'maple-leaf': 72, 'bamboo': 144}
    allowed = {'report.json'} | {f'{name}.mp4' for name in lengths} | {f'{name}/{frame:04}.png' for name, length in lengths.items() for frame in [0, length - 12]}
elif group == 'experience':
    root /= 'fresh-20260913'
    actions = ['idle', 'start-run-stop', 'turn', 'guard', 'windup-attack', 'attack', 'dodge', 'hit', 'parry', 'block', 'broken', 'death', 'victory', 'wind']
    allowed = {'experience-report.json', 'audio/actual-capture-report.json', 'audio/generated/manifest.json', 'motion-study/report.json', 'audio/actual-gameplay-audio.webm', 'audio/actual-gameplay-audio.wav', 'audio/muted-negative-probe.webm'} | {f'motion-study/{name}.mp4' for name in actions} | {f'explore-{name}.png' for name in ['old-waystone', 'valley-frame', 'spring-basin', 'stream-stones', 'sun-ring', 'white-tree']}
elif group == 'fresh':
    root /= 'fresh-20260913'
    allowed = {'browser-report.json', 'route-matrix-report.json', 'recording-report.json', 'build-fingerprint.json'} | {name + '.png' for name in ['encounter', 'mobile-mission-victory-portrait', 'mission-victory', 'title', 'mobile', 'desktop-right-victory', 'touch-left-victory', 'mobile-mission-victory']} | {f'derived/{name}{suffix}' for name in ['desktop', 'touch', 'desktop-right', 'touch-left'] for suffix in ['-fixed-five.json', '-fork-to-signal.mp4']}
    allowed |= {f'decoded/decoded-{name}-{event}.png' for name in ['desktop', 'touch', 'desktop-right', 'touch-left'] for event in ['destination-arrival', 'signal-lit']}
elif group == 'asset-readiness':
    root /= 'fresh-asset-readiness'
    allowed = {'report.json', 'normal.png', 'failed.png'}
elif group == 'public':
    root /= 'fresh-public-preview'
    allowed = {'report.json'} | {name + '.png' for name in ['pc-start', 'pc-moved-attack', 'touch-view-rotated', 'touch-dedicated-attack']}
else:
    raise ValueError('Unknown finite media group')
selected = lambda p: str(p.relative_to(root)) in allowed

resolved_root = root.resolve()
files = sorted(p for p in root.rglob('*') if p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(resolved_root) and selected(p))
assert files, 'No original evidence found'
archive = io.BytesIO()
manifest = []
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        raw = p.read_bytes()
        name = prefix + str(p.relative_to(root))
        z.writestr(name, raw)
        manifest.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
raw = archive.getvalue()
print('MEDIA_ARCHIVE_BEGIN ' + json.dumps({'version': group, 'runnerRevision': os.environ.get('GITHUB_SHA'), 'run': os.environ.get('GITHUB_RUN_ID'), 'job': os.environ.get('GITHUB_JOB'), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'files': manifest}))
encoded = base64.b64encode(raw).decode('ascii')
for start in range(0, len(encoded), 12000):
    print('MEDIA_BYTES ' + encoded[start:start + 12000])
print('MEDIA_ARCHIVE_END')
