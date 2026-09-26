import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let native = true;

vi.mock('./native', () => ({ isNative: () => native }));
vi.mock('@capacitor/haptics', () => ({
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS' },
  Haptics: {
    impact: async ({ style }: { style: string }) => void calls.push(`impact:${style}`),
    notification: async ({ type }: { type: string }) => void calls.push(`notification:${type}`),
    selectionStart: async () => void calls.push('selectionStart'),
    selectionChanged: async () => void calls.push('selectionChanged'),
  },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('haptics', () => {
  beforeEach(() => {
    calls.length = 0;
    store.clear();
    native = true;
  });

  it('starts a selection session before the first tick, once', async () => {
    const { haptic } = await import('./haptics');
    haptic.selection();
    await flush();
    haptic.selection();
    await flush();
    expect(calls).toEqual(['selectionStart', 'selectionChanged', 'selectionChanged']);
  });

  it('maps press and success to a light impact and a success notification', async () => {
    const { haptic } = await import('./haptics');
    haptic.press();
    haptic.success();
    await flush();
    expect(calls).toEqual(['impact:LIGHT', 'notification:SUCCESS']);
  });

  it('is silent on the web and when switched off', async () => {
    const { haptic, setHapticsEnabled, hapticsEnabled } = await import('./haptics');
    native = false;
    haptic.press();
    native = true;
    expect(hapticsEnabled()).toBe(true);
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic.press();
    haptic.success();
    await flush();
    expect(calls).toEqual([]);
  });
});
