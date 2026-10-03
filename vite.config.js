import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync } from 'node:fs';
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

export default defineConfig({
  plugins: [react(), stripDsStore()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
