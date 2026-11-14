'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import { getEssentialsIndex } from '@/lib/essentials-data';
import { cn } from '@/lib/cn';
import { useEssentialsStore } from '@/stores/essentials-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorshipStore } from '@/stores/worship-store';
import type { EssentialItem } from '@/types/quran';
import Counter from './counter';
import ScreenHeader from './screen-header';
import { TASBIH_COPY } from './copy';
import { FREE_COUNTER_ID, countOnce, resetCount, undoOnce } from './tasbih-counts';

const PRESETS = [33, 34, 99, 100] as const;
const MAX_TARGET = 10_000;
// The free counter's target is a per-device convenience, like the haptics switch
const TARGET_KEY = 'tasbih-target';

function readTarget(): number {
  try {
    const n = Number(localStorage.getItem(TARGET_KEY));
    return Number.isInteger(n) && n > 0 && n <= MAX_TARGET ? n : 0;
  } catch {
    return 0;
  }
}

function writeTarget(n: number) {
  try {
    if (n > 0) localStorage.setItem(TARGET_KEY, String(n));
    else localStorage.removeItem(TARGET_KEY);
  } catch { /* private mode: the choice lasts for this visit */ }
}

/** Every Essentials dhikr with a set count (the ones /tasbih?d= can bind) */
async function loadDhikr(): Promise<EssentialItem[]> {
  const all = await getEssentialsIndex();
  return all.flatMap((c) => c.items).filter((i) => i.category === 'dhikr' && (i.repetitions ?? 0) > 0);
}

/**
 * /tasbih (spec 2.2): a free counter with preset targets, or, with ?d=<id>, the
 * Essentials dhikr of that id (its title, Arabic and count). Counts are shared
 * with the Essentials cards and synced; the lifetime total stays on the device.
 * No streaks here. Keeping the screen awake is a device setting and not
 * attempted.
 */
export default function TasbihClient() {
  const params = useSearchParams();
  const wanted = params.get('d');
  const [dhikr, setDhikr] = useState<EssentialItem[] | null>(null);
  const [freeTarget, setFreeTarget] = useState(readTarget);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const arabicScript = useSettingsStore((s) => s.arabicScript);

  useEffect(() => {
    let live = true;
    loadDhikr().then((d) => live && setDhikr(d)).catch(() => live && setDhikr([]));
    return () => {
      live = false;
    };
  }, []);

  // An unknown or not-yet-loaded id falls back to the free counter
  const bound = wanted && dhikr ? dhikr.find((d) => d.id === wanted) ?? null : null;
  const id = bound ? bound.id : FREE_COUNTER_ID;
  const target = bound ? bound.repetitions ?? 0 : freeTarget;
  const count = useEssentialsStore((s) => s.counters[id] ?? 0);
  const lifetime = useWorshipStore((s) => s.tasbihTotals[id] ?? 0);
  const waitingForBinding = !!wanted && dhikr === null;

  const chooseTarget = (n: number) => {
    setFreeTarget(n);
    writeTarget(n);
    setCustomOpen(false);
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(customValue));
    if (Number.isFinite(n) && n > 0) chooseTarget(Math.min(n, MAX_TARGET));
  };

  const isPreset = (PRESETS as readonly number[]).includes(freeTarget);

  return (
    <div className="flex min-h-dvh flex-col bg-cream pb-[calc(var(--tabbar-clearance)+0.5rem)]" data-tasbih>
      <ScreenHeader title={TASBIH_COPY.title} back="/prayer" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4">
        {bound ? (
          <section className="text-center" aria-label={bound.title} data-bound={bound.id}>
            <h2 className="text-base font-semibold text-foreground">{bound.title}</h2>
            {/* No leading override: .arabic-text's own line height keeps the marks clear */}
            <p
              className={cn(arabicScript === 'indopak' ? 'arabic-text-indopak' : 'arabic-text', 'mt-2 !text-center text-[1.75rem] text-foreground sm:text-3xl')}
              dir="rtl"
              lang="ar"
            >
              {bound.arabic}
            </p>
            <p className="mx-auto mt-2 max-w-prose text-xs leading-relaxed text-muted" dir="ltr">
              {bound.transliteration}
            </p>
            {/* The meaning, as the Essentials card shows it */}
            {bound.translation && (
              <p className="mx-auto mt-2 max-w-prose text-sm italic leading-relaxed text-muted" data-bound-meaning>
                {bound.translation}
              </p>
            )}
            {bound.source && <p className="mt-1 text-[11px] text-muted">{TASBIH_COPY.source(bound.source)}</p>}
            <Link href="/tasbih" className="mt-1 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-teal">
              {TASBIH_COPY.free}
            </Link>
          </section>
        ) : (
          <section aria-label={TASBIH_COPY.targetHeading} className={cn(waitingForBinding && 'invisible')}>
            <p className="mb-2 text-xs font-semibold text-muted">{TASBIH_COPY.targetHeading}</p>
            {/* Plain toggle buttons: each one sets the target at once, and Other opens a form */}
            <div className="grid grid-cols-6 gap-1.5" role="group" aria-label={TASBIH_COPY.targetHeading} data-targets>
              <TargetChip selected={freeTarget === 0} onClick={() => chooseTarget(0)}>
                {TASBIH_COPY.noTarget}
              </TargetChip>
              {PRESETS.map((n) => (
                <TargetChip key={n} selected={freeTarget === n} onClick={() => chooseTarget(n)}>
                  {n}
                </TargetChip>
              ))}
              <TargetChip
                selected={freeTarget > 0 && !isPreset}
                expanded={customOpen}
                controls="tasbih-custom-form"
                onClick={() => {
                  setCustomValue(freeTarget > 0 && !isPreset ? String(freeTarget) : '');
                  setCustomOpen((o) => !o);
                }}
              >
                {freeTarget > 0 && !isPreset ? freeTarget : TASBIH_COPY.custom}
              </TargetChip>
            </div>
            {customOpen && (
              <form id="tasbih-custom-form" onSubmit={applyCustom} className="mt-3 flex items-center gap-2">
                <label className="sr-only" htmlFor="tasbih-custom">
                  {TASBIH_COPY.customLabel}
                </label>
                <input
                  id="tasbih-custom"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TARGET}
                  autoFocus
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder={TASBIH_COPY.customLabel}
                  className="min-h-11 w-40 rounded-xl border border-foreground/15 bg-card px-3 text-sm text-foreground outline-none focus:border-teal"
                />
                <button type="submit" className="pressable min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-on-teal">
                  {TASBIH_COPY.customApply}
                </button>
              </form>
            )}
          </section>
        )}

        {/* The counter and its two footer lines share one column: same left edge, same right edge */}
        <div className={cn('flex flex-1 flex-col', waitingForBinding && 'invisible')}>
          <div className="flex min-h-[18rem] flex-1 flex-col">
            <Counter
              count={count}
              target={target}
              label={bound?.title}
              // While a ?d= binding loads, a tap must not land on the free counter
              onCount={() => !waitingForBinding && countOnce(id)}
              onUndo={() => !waitingForBinding && undoOnce(id)}
            />
          </div>

          {(lifetime > 0 || count > 0) && (
            <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="text-xs text-muted tabular-nums" data-lifetime={lifetime}>
                {lifetime > 0 ? TASBIH_COPY.lifetime(lifetime.toLocaleString()) : ''}
              </span>
              {count > 0 && (
                <button type="button" onClick={() => setConfirmReset(true)} className="-mr-2 min-h-11 px-2 font-semibold text-muted hover:text-foreground">
                  {TASBIH_COPY.reset}
                </button>
              )}
            </div>
          )}
        </div>

        {!bound && dhikr && dhikr.length > 0 && (
          <section aria-labelledby="tasbih-dhikr" className="pb-2">
            <h2 id="tasbih-dhikr" className="mb-2 text-xs font-semibold text-muted">
              {TASBIH_COPY.fromEssentials}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {dhikr.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/tasbih?d=${encodeURIComponent(d.id)}`}
                    className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-foreground/10 bg-card px-4 text-sm text-foreground"
                  >
                    {d.title}
                    <span className="text-xs text-muted tabular-nums">{d.repetitions}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <ConfirmSheet
        open={confirmReset}
        title={TASBIH_COPY.resetTitle}
        message={TASBIH_COPY.resetMessage}
        confirmLabel={TASBIH_COPY.resetConfirm}
        onConfirm={() => {
          resetCount(id);
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />

      <BottomNav />
    </div>
  );
}

function TargetChip({
  selected,
  expanded,
  controls,
  onClick,
  children,
}: {
  selected: boolean;
  /** For Other: whether its form is open */
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      onClick={onClick}
      className={cn(
        'pressable min-h-11 min-w-0 truncate rounded-full px-1 text-sm font-semibold tabular-nums',
        selected ? 'bg-teal text-on-teal' : 'border border-foreground/10 bg-card text-foreground',
      )}
    >
      {children}
    </button>
  );
}
