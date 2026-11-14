'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/app-link';
import Button from '@/components/ui/button';
import { ClockIcon, MapPinIcon } from '@/components/ui/icons';
import { useAppBack } from '@/hooks/use-app-back';
import { cn } from '@/lib/cn';
import { NAV_BACK } from '@/lib/nav';
import { regionDefault } from '@/lib/prayer/regions';
import { usePlaceStore } from '@/stores/place-store';
import { usePrayerStore } from '@/stores/prayer-store';
import type { AsrMadhab, MethodId, Place } from '@/types/prayer';
import { AsrChoice, MethodChoice, TimesPreview } from './calc-controls';
import PlacePicker from './place-picker';
import { SectionLabel } from './screen';
import { prefers12h, useNow, usePrayerModule } from './use-prayer-model';

type Step = 1 | 2 | 3;

const TITLES: Record<Step, string> = {
  1: 'Where are you?',
  2: 'How times are worked out',
  3: 'Tell me when each prayer starts?',
};

/**
 * Prayer setup (all-in-one spec 2.7): place; method and Asr, pre-chosen for the
 * place's country with the reason; then alerts. Nothing is saved until step 2 is
 * confirmed, so leaving half way changes nothing.
 */
export default function PrayerSetupFlow() {
  const router = useRouter();
  const leave = useAppBack('/prayer');
  const savedPlace = usePlaceStore((s) => s.place);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const store = usePrayerStore();

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Place | null>(savedPlace);
  const [method, setMethod] = useState<MethodId>(store.method);
  const [madhab, setMadhab] = useState<AsrMadhab>(store.madhab);
  // A method the user picked themselves isn't replaced by the next place's default
  const [methodTouched, setMethodTouched] = useState(store.setupDone);
  const [madhabTouched, setMadhabTouched] = useState(store.setupDone);
  const [changingPlace, setChangingPlace] = useState(!savedPlace);

  const mod = usePrayerModule(step === 2 && !!draft);
  const now = useNow(60_000, step === 2);

  const pick = (p: Place) => {
    setDraft(p);
    setChangingPlace(false);
    const d = regionDefault(p.countryCode);
    if (!methodTouched) setMethod(d.method);
    if (!madhabTouched) setMadhab(d.madhab);
    setStep(2);
  };

  const confirm = () => {
    if (!draft) return;
    setPlace(draft);
    store.setMethod(method);
    store.setMadhab(madhab);
    store.completeSetup();
    setStep(3);
  };

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) router.replace('/prayer', { transitionTypes: [NAV_BACK] });
    else leave();
  };

  const region = draft ? regionDefault(draft.countryCode) : null;
  const reason = region && method === region.method ? region.reason : undefined;
  const hour12 = prefers12h();
  const preview =
    mod && draft
      ? mod.dayTimes(draft, { method, madhab, highLatRule: store.highLatRule, offsets: store.offsets, ...(store.customAngles ? { customAngles: store.customAngles } : {}) }, now)
      : null;

  return (
    // group/setup: while the city search has focus (keyboard up) the footer steps aside for the results
    <div className="group/setup min-h-dvh bg-cream pb-32" data-prayer-setup={step}>
      <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step {step} of 3</p>
              <h1 className="text-xl font-bold text-teal">{TITLES[step]}</h1>
            </div>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors', s <= step ? 'bg-teal' : 'bg-foreground/10')} />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-2">
        {step === 1 && (
          <>
            <p className="text-sm leading-relaxed text-muted">
              Prayer times, worked out on your phone. Your location is never sent anywhere.
            </p>
            {draft && !changingPlace ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-card px-4 py-3.5">
                  <MapPinIcon size={18} className="shrink-0 text-teal" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{draft.label || 'Your place'}</p>
                  <button type="button" className="text-sm font-semibold text-teal" onClick={() => setChangingPlace(true)}>
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <>
                <PlacePicker onPick={pick} />
                {draft && (
                  <button type="button" className="px-1 text-sm font-semibold text-teal" onClick={() => setChangingPlace(false)}>
                    Keep {draft.label || 'your place'}
                  </button>
                )}
              </>
            )}
          </>
        )}

        {step === 2 && draft && (
          <>
            <button
              type="button"
              onClick={() => {
                setChangingPlace(true);
                setStep(1);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left text-sm text-muted hover:text-foreground"
              data-setup-place
            >
              <MapPinIcon size={15} className="shrink-0 text-teal" />
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{draft.label || 'Your place'}</span>
              <span className="shrink-0 font-semibold text-teal">Change</span>
            </button>

            <section className="space-y-2">
              <SectionLabel>Today</SectionLabel>
              <TimesPreview times={preview} format={(ms) => (mod ? mod.formatTime(ms, draft.tz, { hour12 }) : '')} />
            </section>

            <section className="space-y-2">
              <SectionLabel>Calculation method</SectionLabel>
              <MethodChoice
                value={method}
                reason={reason}
                onChange={(m) => {
                  setMethod(m);
                  setMethodTouched(true);
                }}
              />
            </section>

            <section className="space-y-2">
              <SectionLabel>Asr time</SectionLabel>
              <AsrChoice
                value={madhab}
                onChange={(m) => {
                  setMadhab(m);
                  setMadhabTouched(true);
                }}
              />
            </section>

            <p className="px-1 text-xs leading-relaxed text-muted">
              Mosques near you may differ by a few minutes. You can change any of this later, or match your mosque’s timetable.{' '}
              <Link href="/prayer/why" className="font-semibold text-teal underline underline-offset-2">
                Why times differ
              </Link>
            </p>
          </>
        )}

        {step === 3 && (
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
              <ClockIcon size={22} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Takrar can let you know when each prayer’s time begins. You choose which prayers, and a sound or silent.
            </p>
          </div>
        )}
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm group-has-[#city-search:focus]/setup:hidden"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-2xl gap-3">
          {step === 3 ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={() => router.replace('/prayer', { transitionTypes: [NAV_BACK] })}>
                Not now
              </Button>
              <Link
                href="/prayer/alerts"
                replace
                className="tactile-btn flex-1 rounded-xl bg-teal px-6 py-3 text-center font-semibold text-on-teal hover:bg-teal-light"
                data-setup-alerts
              >
                Set up alerts
              </Link>
            </>
          ) : (
            <>
              <Button variant="ghost" className="flex-1" onClick={goBack}>
                {step > 1 ? 'Back' : 'Cancel'}
              </Button>
              {/* Picking a place moves on by itself, so step 1 offers Continue only for a place already chosen */}
              {(step === 2 || (draft && !changingPlace)) && (
                <Button className="flex-1" disabled={!draft} onClick={() => (step === 1 ? setStep(2) : confirm())} data-setup-next>
                  {step === 2 ? 'Save' : 'Continue'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
