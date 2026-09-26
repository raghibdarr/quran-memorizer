#!/usr/bin/env node
// Post-build fix for a Next.js 16 static-export mismatch (present in 16.1–16.3):
// the exporter writes per-segment prefetch payloads as NESTED paths
//   out/plan/setup/__next.plan/setup/__PAGE__.txt
// but the client router requests them DOT-JOINED
//   /plan/setup/__next.plan.setup.__PAGE__.txt
// so every segment prefetch 404s (navigation survives by falling back to the
// full payload, but each prefetch is a wasted round trip). This renames each
// nested file to the name the client asks for. Idempotent; runs as `postbuild`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
if (!fs.existsSync(out)) {
  console.log('flatten-segments: no out/ directory — skipped');
  process.exit(0);
}

let moved = 0;

// Every `__next.<segment>` DIRECTORY is the root of one nested segment tree.
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__next.')) flatten(full, dir, entry.name);
    else visit(full);
  }
}

function flatten(treeDir, parentDir, prefix) {
  for (const entry of fs.readdirSync(treeDir, { withFileTypes: true })) {
    const full = path.join(treeDir, entry.name);
    const joined = `${prefix}.${entry.name}`;
    if (entry.isDirectory()) {
      flatten(full, parentDir, joined);
    } else {
      fs.renameSync(full, path.join(parentDir, joined));
      moved++;
    }
  }
  fs.rmSync(treeDir, { recursive: true, force: true });
}

visit(out);
console.log(`flatten-segments: renamed ${moved} segment payloads to dot-joined names`);
