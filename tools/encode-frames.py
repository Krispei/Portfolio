#!/usr/bin/env python3
"""Turn the PNGs from tools/render-frames.html (.frames-src/) into the WebP
frame sets the hero plays (public/hero-frames/<set>/NNNN.webp), and write
src/hero/frames.json describing them. Needs Pillow:  pip3 install pillow

    python3 tools/encode-frames.py
"""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / '.frames-src'
OUT = ROOT / 'public' / 'hero-frames'
SETS = {'d': 1024, 'm': 640}  # desktop / phone: pixel size of the square frames
QUALITY = 78

meta = json.loads((SRC / 'meta.json').read_text())
count = meta['count']

if OUT.exists():
    shutil.rmtree(OUT)
total = {}
for name, size in SETS.items():
    (OUT / name).mkdir(parents=True)
    total[name] = 0
    for i in range(count):
        im = Image.open(SRC / f'{i:04d}.png').convert('RGB').resize((size, size), Image.LANCZOS)
        path = OUT / name / f'{i:04d}.webp'
        im.save(path, 'WEBP', quality=QUALITY, method=6)
        total[name] += path.stat().st_size

bg = Image.open(SRC / '0000.png').convert('RGB').getpixel((2, 2))
# a fingerprint of the frames: the player adds it to each frame URL, so the
# frames can be cached for a year and a re-render still reaches every visitor
digest = hashlib.sha1()
for path in sorted(OUT.rglob('*.webp')):
    digest.update(path.read_bytes())
manifest = {
    'count': count,
    'step': meta['step'],
    'pmax': meta['pmax'],
    'sets': SETS,
    'bg': '#%02x%02x%02x' % bg,
    'version': digest.hexdigest()[:10],
}
(ROOT / 'src' / 'hero' / 'frames.json').write_text(json.dumps(manifest, indent=2) + '\n')
for name in SETS:
    print(f'{name}: {count} frames, {total[name] / 1e6:.1f} MB')
