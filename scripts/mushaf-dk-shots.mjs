#!/usr/bin/env node
// Mushaf prototype: phone-width screenshots and timings of /mushaf/dk.
//   node scripts/mushaf-dk-shots.mjs <baseUrl> [outDir] [fit]
// Writes <outDir>/dk-p<N>-<light|dark>[-squeeze].png and timings.json.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4520';
const outDir = path.resolve(process.argv[3] ?? '.shots');
const fit = process.argv[4] === 'squeeze' ? 'squeeze' : null;
const PAGES = (process.env.PAGES ?? '1,2,3,50,300,604').split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium' });
const timings = [];
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // THROTTLE=4: emulate a mid-range phone CPU (Chrome DevTools' 4x slowdown)
  const throttle = Number(process.env.THROTTLE || 1);
  if (throttle > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let first = true;
  for (const n of PAGES) {
    const url = `${base}/mushaf/dk?page=${n}${fit ? `&fit=${fit}` : ''}`;
    const t0 = Date.now();
    if (first) await page.goto(url);
    // Later pages: turn client-side, as a reader would (engine already loaded)
    else await page.evaluate((u) => { window.history.replaceState(null, '', u); window.dispatchEvent(new PopStateEvent('popstate')); }, url);
    await page.waitForFunction((p) => document.documentElement.dataset.mushafDkReady === String(p), n, { timeout: 30000 });
    const wall = Date.now() - t0;
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => window.__mushafDk);
    timings.push({ scheme, throttle, page: n, firstLoad: first, wallMs: wall, ...m });
    if (process.env.NO_SHOTS) { first = false; continue; }
    const file = path.join(outDir, `dk-p${n}-${scheme}${fit ? '-squeeze' : ''}.png`);
    await page.screenshot({ path: file });
    first = false;
  }
  if (errors.length) console.log(scheme, 'errors:', errors);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, `timings${fit ? '-squeeze' : ''}${process.env.THROTTLE ? `-x${process.env.THROTTLE}` : ''}.json`), JSON.stringify(timings, null, 1));
console.table(timings.map((t) => ({ scheme: t.scheme, page: t.page, first: t.firstLoad, wall: t.wallMs, load: t.loadMs?.toFixed(0), layout: t.layoutMs?.toFixed(1), paint: t.renderMs?.toFixed(1), squeezed: t.squeezed, minX: t.minXScale?.toFixed(3) })));
