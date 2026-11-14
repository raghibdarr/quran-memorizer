'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/app-link';
import { MapPinIcon } from '@/components/ui/icons';
import SegmentedControl from '@/components/ui/segmented-control';
import { methodInfo } from '@/lib/prayer/methods';
import { regionDefault } from '@/lib/prayer/regions';
import { usePlaceStore } from '@/stores/place-store';
import { MAX_OFFSET_MIN, usePrayerStore } from '@/stores/prayer-store';
import { TIME_LABELS, TIME_NAMES, type CustomAngles, type HighLatRule, type MethodId } from '@/types/prayer';
import { AsrChoice, MethodChoice, RadioRow, RowGroup, Stepper, SwitchRow, TimesPreview } from './calc-controls';
import PlacePicker from './place-picker';
import PrayerScreen, { SectionLabel } from './screen';
import { prefers12h, useModelSettings, useNow, usePlace, usePrayerModule } from './use-prayer-model';

const HIGH_LAT: Array<{ id: HighLatRule; title: string; detail: string }> = [
  { id: 'auto', title: 'Automatic', detail: 'The rule that suits your latitude. Where the sun never sets or rises, the nearest day that has both is used.' },
  { id: 'middleofthenight', title: 'Middle of the night', detail: 'Fajr no earlier, and Isha no later, than the middle of the night.' },
  { id: 'seventhofthenight', title: 'One seventh of the night', detail: 'Isha by the end of the night’s first seventh; Fajr from the start of its last seventh.' },
  { id: 'twilightangle', title: 'Twilight angle', detail: 'Like the seventh, but the share of the night follows the method’s Fajr and Isha angles.' },
];

const HIGH_LAT_SHORT: Record<Exclude<HighLatRule, 'auto'>, string> = {
  middleofthenight: 'middle of the night',
  seventhofthenight: 'one seventh of the night',
  twilightangle: 'twilight angle',
};

const signedMin = (n: number) => (n === 0 ? '0 min' : `${n > 0 ? '+' : '−'}${Math.abs(n)} min`);
const signedDays = (n: number) => (n === 0 ? 'None' : `${n > 0 ? '+' : '−'}${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`);

/** The starting angles when someone switches to custom: the method they were on */
function anglesFrom(method: MethodId): CustomAngles {
  const m = methodInfo(method);
  return {
    fajr: m.fajrAngle ?? 18,
    isha: m.ishaAngle ?? 17,
    ...(m.ishaInterval ? { ishaInterval: m.ishaInterval } : {}),
  };
}

/** A number field that only reports values inside its range */
function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  label,
  unit,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
  unit: string;
}) {
  const [text, setText] = useState(String(value));
  // A change from elsewhere (switching Isha mode) shows here; typing in progress is left alone
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => setText(String(value))}
          className="w-20 rounded-lg border-[1.5px] border-foreground/15 bg-cream px-2 py-1.5 text-right text-base tabular-nums text-foreground focus:border-teal focus:outline-none"
        />
        <span className="w-14 text-xs text-muted">{unit}</span>
      </span>
    </label>
  );
}

function CustomAnglesEditor() {
  const angles = usePrayerStore((s) => s.customAngles) ?? { fajr: 18, isha: 17 };
  const setCustomAngles = usePrayerStore((s) => s.setCustomAngles);
  const interval = angles.ishaInterval !== undefined;
  return (
    <div className="space-y-2" data-custom-angles>
      <RowGroup>
        <NumberField label="Fajr angle" unit="degrees" min={10} max={25} step={0.1} value={angles.fajr} onChange={(fajr) => setCustomAngles({ ...angles, fajr })} />
        <div className="px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-foreground">Isha</p>
          <SegmentedControl
            options={[
              { value: 'angle', label: 'By angle' },
              { value: 'interval', label: 'After Maghrib' },
            ]}
            value={interval ? 'interval' : 'angle'}
            onChange={(v) => {
              if (v === 'interval') setCustomAngles({ ...angles, ishaInterval: angles.ishaInterval ?? 90 });
              else setCustomAngles({ fajr: angles.fajr, isha: angles.isha });
            }}
          />
        </div>
        {interval ? (
          <NumberField
            label="Isha"
            unit="min after"
            min={1}
            max={180}
            step={1}
            value={angles.ishaInterval!}
            onChange={(n) => setCustomAngles({ ...angles, ishaInterval: Math.round(n) })}
          />
        ) : (
          <NumberField label="Isha angle" unit="degrees" min={10} max={25} step={0.1} value={angles.isha} onChange={(isha) => setCustomAngles({ ...angles, isha })} />
        )}
      </RowGroup>
      <p className="px-1 text-xs leading-relaxed text-muted">How far the sun is below the horizon when Fajr begins and Isha begins. Most timetables use 15 to 20 degrees.</p>
    </div>
  );
}

/** /prayer/settings (all-in-one spec 2.2): every choice updates the times above it at once */
export default function PrayerSettingsScreen() {
  const place = usePlace();
  const setPlace = usePlaceStore((s) => s.setPlace);
  const store = usePrayerStore();
  const settings = useModelSettings();
  const mod = usePrayerModule(!!place);
  const now = useNow(60_000, !!place);
  // No place yet: the picker is open from the start
  const [changingPlace, setChangingPlace] = useState(() => !place);
  const [suggest, setSuggest] = useState<ReturnType<typeof regionDefault> | null>(null);

  // Arriving at #place or #high-latitude from the hub: the section, below the sticky header
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, []);

  const hour12 = prefers12h();
  const format = (ms: number) => (mod && place ? mod.formatTime(ms, place.tz, { hour12 }) : '');
  const times = mod && place ? mod.dayTimes(place, settings, now) : null;
  const effective = mod && place ? mod.effectiveHighLatRule(place, 'auto') : null;

  const chooseMethod = (m: MethodId) => {
    if (m === 'custom' && !store.customAngles) store.setCustomAngles(anglesFrom(store.method));
    store.setMethod(m);
  };

  return (
    <PrayerScreen title="Prayer settings" back="/prayer">
      {place && (
        <section className="space-y-2" aria-labelledby="today-label">
          <SectionLabel id="today-label">Today</SectionLabel>
          <TimesPreview times={times} format={format} />
        </section>
      )}

      <section id="place" className="scroll-mt-20 space-y-2">
        <SectionLabel>Place</SectionLabel>
        {place && !changingPlace ? (
          <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-card px-4 py-3.5">
            <MapPinIcon size={18} className="shrink-0 text-teal" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground" data-settings-place>
                {place.label || 'Your place'}
              </p>
              <p className="text-xs text-muted">{place.source === 'gps' ? 'From your location, kept on this phone' : 'Chosen from the city list'}</p>
            </div>
            <button type="button" className="shrink-0 text-sm font-semibold text-teal" onClick={() => setChangingPlace(true)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <PlacePicker
              onPick={(p) => {
                setPlace(p);
                store.completeSetup();
                setChangingPlace(false);
                const d = regionDefault(p.countryCode);
                setSuggest(d.method !== store.method || d.madhab !== store.madhab ? d : null);
              }}
            />
            {place && (
              <button type="button" className="px-1 text-sm font-semibold text-teal" onClick={() => setChangingPlace(false)}>
                Keep {place.label || 'your place'}
              </button>
            )}
          </>
        )}
        {suggest && (
          <div className="rounded-xl border border-gold/30 bg-gold/[0.07] px-3.5 py-3 text-sm" role="status">
            <p className="text-foreground">{suggest.reason}</p>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                className="font-semibold text-teal"
                onClick={() => {
                  store.setMethod(suggest.method);
                  store.setMadhab(suggest.madhab);
                  setSuggest(null);
                }}
              >
                Use {methodInfo(suggest.method).label}
                {suggest.madhab === 'hanafi' ? ', Hanafi Asr' : ''}
              </button>
              <button type="button" className="font-semibold text-muted" onClick={() => setSuggest(null)}>
                Keep mine
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel>Calculation method</SectionLabel>
        <MethodChoice value={store.method} onChange={chooseMethod} includeCustom />
        {store.method === 'custom' && <CustomAnglesEditor />}
      </section>

      <section className="space-y-2">
        <SectionLabel>Asr time</SectionLabel>
        <AsrChoice value={store.madhab} onChange={store.setMadhab} />
      </section>

      <section id="high-latitude" className="scroll-mt-20 space-y-2">
        <SectionLabel>Far north and south</SectionLabel>
        <RowGroup label="High-latitude rule">
          {HIGH_LAT.map((r) => (
            <RadioRow
              key={r.id}
              selected={store.highLatRule === r.id}
              onSelect={() => store.setHighLatRule(r.id)}
              title={r.id === 'auto' && effective ? `Automatic (${HIGH_LAT_SHORT[effective]} here)` : r.title}
              detail={r.detail}
              testId={`highlat-${r.id}`}
            />
          ))}
        </RowGroup>
        <p className="px-1 text-xs leading-relaxed text-muted">
          In summer far from the equator, the sky may not get dark enough for the usual Fajr and Isha angles. These rules give a time anyway.
        </p>
      </section>

      <section className="space-y-2">
        <SectionLabel>Adjust times</SectionLabel>
        <RowGroup>
          {TIME_NAMES.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 px-4 py-2" data-offset={t}>
              <span className="text-sm font-semibold text-foreground">{TIME_LABELS[t]}</span>
              <Stepper
                label={`${TIME_LABELS[t]} adjustment`}
                value={store.offsets[t]}
                min={-MAX_OFFSET_MIN}
                max={MAX_OFFSET_MIN}
                format={signedMin}
                onChange={(n) => store.setOffset(t, n)}
              />
            </div>
          ))}
        </RowGroup>
        <p className="px-1 text-xs leading-relaxed text-muted">
          Add or take away minutes, for example to follow your mosque. Or let{' '}
          <Link href="/prayer/match" className="font-semibold text-teal underline underline-offset-2">
            Match my mosque
          </Link>{' '}
          work them out.
        </p>
      </section>

      <section className="space-y-2">
        <SectionLabel>Hijri date</SectionLabel>
        <RowGroup>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Adjust by</p>
              {mod && place && (
                <p className="mt-0.5 text-xs text-muted" data-hijri-preview>
                  Today: {mod.hijriToday(place, store.hijriOffset, now)} (expected)
                </p>
              )}
            </div>
            <Stepper label="Hijri date adjustment" value={store.hijriOffset} min={-2} max={2} format={signedDays} onChange={store.setHijriOffset} />
          </div>
        </RowGroup>
        <p className="px-1 text-xs leading-relaxed text-muted">Move the date a day or two to match the moon sighting announced where you live.</p>
      </section>

      <section className="space-y-2">
        <SectionLabel>Home</SectionLabel>
        <RowGroup>
          <SwitchRow label="Next prayer on Home" detail="One line under the header, for example “Asr 15:12 · in 1 h 4 min”." checked={store.homeStrip} onChange={store.setHomeStrip} />
        </RowGroup>
      </section>

      <section className="space-y-2">
        <SectionLabel>More</SectionLabel>
        <RowGroup>
          {[
            { href: '/prayer/alerts', title: 'Prayer alerts', detail: 'A sound or a silent note at each time' },
            { href: '/prayer/match', title: 'Match my mosque', detail: 'Fit the settings to your mosque’s timetable' },
            { href: '/prayer/why', title: 'Why times differ', detail: 'Between apps, mosques and countries' },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-foreground/[0.03]">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{l.title}</span>
                <span className="block text-xs text-muted">{l.detail}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </RowGroup>
      </section>

      <p className="px-1 pb-2 text-center text-xs text-muted">Your place and these settings stay on this phone. They are not synced.</p>
    </PrayerScreen>
  );
}
