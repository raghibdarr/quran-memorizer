'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlaceStore } from '@/stores/place-store';
import { usePrayerStore } from '@/stores/prayer-store';
import type { ModelSettings } from './model';

type ModelModule = typeof import('./model');

let cached: ModelModule | null = null;
let loading: Promise<ModelModule> | null = null;

/** Loads the engine (adhan) and the screen model on first use, once */
export function loadPrayerModel(): Promise<ModelModule> {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = import('./model').then((m) => (cached = m)).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/** The model module, or null until it has loaded. Pass false to keep it unloaded (no place yet) */
export function usePrayerModule(enabled = true): ModelModule | null {
  const [mod, setMod] = useState<ModelModule | null>(cached);
  useEffect(() => {
    if (!enabled || mod) return;
    let alive = true;
    loadPrayerModel()
      .then((m) => alive && setMod(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, mod]);
  return enabled ? mod : null;
}

/**
 * "Now", refreshed every `everyMs` (default 15 s: countdowns are in minutes)
 * and whenever the screen comes back into view. Disabled, it stops ticking
 */
export function useNow(everyMs = 15_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, everyMs);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [everyMs, enabled]);
  return now;
}

/** The calculation settings plus what the screens need besides, from the prayer store */
export function useModelSettings(): ModelSettings {
  const method = usePrayerStore((s) => s.method);
  const madhab = usePrayerStore((s) => s.madhab);
  const highLatRule = usePrayerStore((s) => s.highLatRule);
  const offsets = usePrayerStore((s) => s.offsets);
  const customAngles = usePrayerStore((s) => s.customAngles);
  const hijriOffset = usePrayerStore((s) => s.hijriOffset);
  const ramadanMode = usePrayerStore((s) => s.ramadanMode);
  return useMemo(
    () => ({
      method,
      madhab,
      highLatRule,
      offsets,
      ...(customAngles ? { customAngles } : {}),
      hijriOffset,
      ramadanMode,
    }),
    [method, madhab, highLatRule, offsets, customAngles, hijriOffset, ramadanMode],
  );
}

export function usePlace() {
  return usePlaceStore((s) => s.place);
}

/** Whether the device shows a 12-hour clock (its own locale settings decide) */
export function prefers12h(): boolean {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h11' || hc === 'h12';
  } catch {
    return false;
  }
}
