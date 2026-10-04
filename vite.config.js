import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// macOS Finder keeps re-creating .DS_Store files in public/; never ship them
const stripDsStore = () => ({
  name: 'strip-ds-store',
  apply: 'build',
  closeBundle() {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === '.DS_Store') rmSync(p);
      }
    };
    walk('dist');
  },
});

// dev only: tools/render-frames.html posts each baked hero frame here, and it's
// written to .frames-src/ for tools/encode-frames.py
const saveFrames = () => ({
  name: 'save-frames',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__save-frame', (req, res) => {
      const url = new URL(req.url, 'http://x');
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        mkdirSync('.frames-src', { recursive: true });
        const name = url.searchParams.has('meta') ? 'meta.json' : `${url.searchParams.get('i').padStart(4, '0')}.png`;
        writeFileSync(join('.frames-src', name), Buffer.concat(chunks));
        res.end('ok');
      });
    });
  },
});

// start downloading the hero's first frame with the HTML, before any JS runs
// (the right set for the screen: see FramePlayer.js)
const preloadFirstFrame = () => ({
  name: 'preload-first-frame',
  transformIndexHtml() {
    const { version } = JSON.parse(readFileSync('src/hero/frames.json', 'utf8'));
    const link = (set, media) => ({
      tag: 'link',
      attrs: { rel: 'preload', as: 'image', type: 'image/webp', href: `/hero-frames/${set}/0000.webp?v=${version}`, media, fetchpriority: 'high' },
      injectTo: 'head',
    });
    return [link('d', '(min-width: 700px) and (min-height: 700px)'), link('m', '(max-width: 699px), (max-height: 699px)')];
  },
});

export default defineConfig({
  plugins: [react(), stripDsStore(), saveFrames(), preloadFirstFrame()],
  build: { target: 'es2020' },
});
