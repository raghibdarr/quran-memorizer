#!/usr/bin/env node
// Serves the static export (out/) the way each real host does, for local QA and
// the Playwright smoke:
//
//   web    — Netlify-style: /x → x.html or x/index.html; unknown → 404.html
//   native — Capacitor-style "html5mode": any path WITHOUT a file extension gets
//            the ROOT index.html (both the iOS and Android shells do this), so a
//            full page load to a deep path shows the wrong page unless the app
//            navigates client-side. Emulating it here catches that on any machine.
//
// Usage: node scripts/serve-static.mjs <web|native> [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] === 'native' ? 'native' : 'web';
const port = Number(process.argv[3] ?? (mode === 'native' ? 4174 : 4173));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
};

function file(p) {
  try {
    return fs.statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/\/+$/, '') || '/';
  const abs = path.join(root, clean);
  if (!abs.startsWith(root)) return { status: 403 };

  if (mode === 'native') {
    const last = clean.split('/').pop() ?? '';
    if (clean === '/' || !last.includes('.')) return { status: 200, path: path.join(root, 'index.html') };
    const f = file(abs);
    return f ? { status: 200, path: f } : { status: 404 };
  }

  const hit = file(abs) ?? file(`${abs}.html`) ?? file(path.join(abs, 'index.html'));
  if (hit) return { status: 200, path: hit };
  const notFound = file(path.join(root, '404.html'));
  return notFound ? { status: 404, path: notFound } : { status: 404 };
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    const r = resolve(pathname);
    if (!r.path) {
      res.writeHead(r.status);
      res.end();
      return;
    }
    res.writeHead(r.status, { 'Content-Type': TYPES[path.extname(r.path)] ?? 'application/octet-stream' });
    fs.createReadStream(r.path).pipe(res);
  })
  .listen(port, () => console.log(`serving out/ (${mode} mode) on http://localhost:${port}`));
