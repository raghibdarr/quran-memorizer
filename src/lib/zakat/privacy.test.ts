import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FLAG_KEYS, STORE_NAMES } from '@/lib/sync/merge';
import { getLocalData, getLocalFlags } from '@/lib/sync/local';
import { ZAKAT_STORE_KEY } from '@/stores/zakat-store';

// The zakat store is device-only (spec 3.2): nothing from it may reach sync or
// any network request. Sync reads only STORE_NAMES and FLAG_KEYS, so seeding a
// distinctive zakat state and reading everything sync would read proves it.

const MARK = 'ZAKAT-PRIVACY-MARK';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('zakat stays on the device', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
    localStorage.setItem(
      ZAKAT_STORE_KEY,
      JSON.stringify({ state: { inputs: { cash: 987654.32 }, options: {}, nisabBasis: 'gold', pricePerGram: { gold: 77.7, silver: 0.9 }, currency: MARK, hawlStartIso: '2026-02-03' }, version: 1 }),
    );
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('is not a synced store or flag', () => {
    expect(STORE_NAMES as readonly string[]).not.toContain(ZAKAT_STORE_KEY);
    expect(FLAG_KEYS as readonly string[]).not.toContain(ZAKAT_STORE_KEY);
  });

  it('nothing sync reads contains zakat data', () => {
    const everything = JSON.stringify({ stores: STORE_NAMES.map((n) => getLocalData(n)), flags: getLocalFlags() });
    expect(everything).not.toContain(MARK);
    expect(everything).not.toContain('987654');
    expect(everything).not.toContain('2026-02-03');
  });

  it('the zakat code makes no network calls', () => {
    const dirs = ['src/lib/zakat', 'src/components/zakat', 'src/app/zakat'];
    for (const dir of dirs) {
      const abs = path.resolve(process.cwd(), dir);
      if (!fs.existsSync(abs)) continue;
      for (const f of fs.readdirSync(abs)) {
        if (f.endsWith('.test.ts')) continue;
        const src = fs.readFileSync(path.join(abs, f), 'utf8');
        expect(src, `${dir}/${f}`).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|supabase|https?:\/\//);
      }
    }
  });
});
