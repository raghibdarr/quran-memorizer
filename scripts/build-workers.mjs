#!/usr/bin/env node
// Bundles TypeScript web workers into public/workers/ (served as-is by the static
// export and the native shells). Runs before `next build` and `next dev`.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/workers/tilawa-worker.ts'],
  outfile: 'public/workers/tilawa-worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'linked',
  logLevel: 'warning',
});
console.log('built public/workers/tilawa-worker.js');
