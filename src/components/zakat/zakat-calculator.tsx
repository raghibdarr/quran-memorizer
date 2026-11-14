'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import SegmentedControl from '@/components/ui/segmented-control';
import { CoinsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { useZakatStore, type NisabBasis } from '@/stores/zakat-store';
import { usePrayerStore } from '@/stores/prayer-store';
import {
  calculateZakat,
  inputFromStore,
  NISAB_GRAMS,
  ZAKAT_OPTIONS,
  type BasisResult,
  type DebtChoice,
  type Missing,
  type Reckoning,
  type WornChoice,
  type ZakatField,
  type ZakatResult,
} from '@/lib/zakat/calc';
import { formatCivilDate, formatGrams, formatMoney } from '@/lib/zakat/format';
import { hijriLabel, nextHawlDate } from '@/lib/zakat/hawl';
import { hawlReminderSupported, requestHawlPermission, syncHawlReminder } from '@/lib/zakat/reminder';
import { daysBetween, todayIso } from '@/lib/dates';
import NoteBlock, { UnreviewedLine } from './note-block';
import { AmountField, ChoiceChips, SectionTitle, Toggle } from './fields';

const noop = () => () => {};

/** True once on the client, so remembered values render without a hydration mismatch */
function useClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export default function ZakatCalculator() {
  const client = useClient();
  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/prayer" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Zakat</h1>
          <span aria-hidden />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-5">
        {client ? <Calculator /> : <div className="h-64 animate-pulse rounded-2xl bg-foreground/5" />}
      </main>
      <BottomNav />
    </div>
  );
}

function Calculator() {
  const z = useZakatStore();
  const hijriOffset = usePrayerStore((s) => s.hijriOffset);
  const [confirmClear, setConfirmClear] = useState(false);
  // Fields keep their own typing state; bumping this remounts them after a clear
  const [formKey, setFormKey] = useState(0);

  const input = useMemo(() => inputFromStore(z), [z]);
  const result = useMemo(() => calculateZakat(input), [input]);
  const currency = z.currency;
  const money = (n: number) => formatMoney(n, currency);
  const unit = currency.trim() || undefined;
  const field = (id: ZakatField) => ({ value: z.inputs[id], onChange: (n: number | null) => z.setInput(id, n), testId: `zakat-${id}` });

  return (
    <>
      <Card className="flex gap-3.5">
        <CoinsIcon size={24} className="mt-0.5 shrink-0 text-gold-deep" />
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">Work out your zakat</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            For cash, gold, silver, goods for sale and money owed to you. Everything you enter stays on this phone.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Not covered here: livestock, crops, and business cases such as shares, pensions and long-term debts. For those, ask a
            scholar you trust.
          </p>
        </div>
      </Card>

      <div key={formKey} className="space-y-3">
        {/* ---------- prices ---------- */}
        <SectionTitle>Today&apos;s prices</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm text-muted">
            Takrar has no price feed, so enter today&apos;s prices from a source you trust. They stay as you left them until you change
            them.
          </p>
          <div>
            <label htmlFor="zakat-currency" className="block text-sm font-medium text-foreground">
              Currency
            </label>
            <p className="text-xs text-muted">Shown beside amounts, as you type it: £, $, PKR</p>
            <input
              id="zakat-currency"
              data-testid="zakat-currency"
              value={currency}
              maxLength={12}
              autoComplete="off"
              placeholder="£"
              onChange={(e) => z.setCurrency(e.target.value)}
              className="mt-1.5 w-28 rounded-xl border border-foreground/15 bg-card px-3.5 py-2.5 text-base text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AmountField label="Gold, per gram" value={z.pricePerGram.gold} onChange={(n) => z.setPrice('gold', n)} unit={unit} testId="zakat-price-gold" />
            <AmountField label="Silver, per gram" value={z.pricePerGram.silver} onChange={(n) => z.setPrice('silver', n)} unit={unit} testId="zakat-price-silver" />
          </div>
        </Card>

        {/* ---------- nisab ---------- */}
        <SectionTitle>Nisab</SectionTitle>
        <NisabCard
          basis={z.nisabBasis}
          onBasis={z.setNisabBasis}
          reckoning={input.reckoning}
          onReckoning={(r) => z.setOption(ZAKAT_OPTIONS.reckoning, r)}
          result={result}
          money={money}
        />

        {/* ---------- assets ---------- */}
        <SectionTitle>What you have</SectionTitle>
        <Card className="space-y-4">
          <AmountField label="Cash and savings" hint="In hand and in the bank" unit={unit} {...field('cash')} />
          <div className="grid grid-cols-2 gap-3">
            <AmountField label="Gold you keep" hint="Coins, bars, savings" unit="g" {...field('goldGrams')} />
            <AmountField label="Silver you keep" hint="Coins, bars, savings" unit="g" {...field('silverGrams')} />
          </div>
          <div>
            <AmountField label="Goods for sale" hint="At what they would sell for today" unit={unit} {...field('tradeGoods')} />
            <NoteBlock id="trade-goods" />
          </div>
          <div>
            <AmountField label="Money owed to you" hint="That you expect to be repaid" unit={unit} {...field('receivables')} />
            <NoteBlock id="receivables" />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-foreground">Jewellery you wear</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <AmountField label="Gold" unit="g" {...field('goldWornGrams')} />
            <AmountField label="Silver" unit="g" {...field('silverWornGrams')} />
          </div>
          <p className="mt-3 text-sm text-muted">Count worn jewellery?</p>
          <ChoiceChips<WornChoice>
            name="worn-jewellery"
            label="Count worn jewellery"
            value={input.wornJewellery}
            onChange={(v) => z.setOption(ZAKAT_OPTIONS.wornJewellery, v)}
            options={[
              { value: 'include', label: 'Count it' },
              { value: 'exclude', label: 'Leave it out' },
            ]}
          />
          <NoteBlock id="worn-jewellery" open={result.missing.includes('worn-choice')} />
        </Card>

        {/* ---------- debts ---------- */}
        <SectionTitle>What you owe</SectionTitle>
        <Card>
          <AmountField label="Debts due now" hint="Money you owe that is due to be paid" unit={unit} {...field('debts')} />
          <p className="mt-3 text-sm text-muted">Take debts off before comparing with nisab?</p>
          <ChoiceChips<DebtChoice>
            name="debts"
            label="Take debts off"
            value={input.debts}
            onChange={(v) => z.setOption(ZAKAT_OPTIONS.debts, v)}
            options={[
              { value: 'deduct', label: 'Take them off' },
              { value: 'keep', label: 'Leave them in' },
            ]}
          />
          <NoteBlock id="debts" open={result.missing.includes('debt-choice')} />
        </Card>
      </div>

      {/* ---------- result ---------- */}
      <SectionTitle>Result</SectionTitle>
      <ResultCard result={result} basis={z.nisabBasis} money={money} />

      {/* ---------- hawl ---------- */}
      <SectionTitle>Your zakat year</SectionTitle>
      <HawlCard
        startIso={z.hawlStartIso}
        onStart={z.setHawlStart}
        offset={hijriOffset}
        reminderOn={z.options[ZAKAT_OPTIONS.hawlReminder] === 'on'}
        onReminder={(on) => z.setOption(ZAKAT_OPTIONS.hawlReminder, on ? 'on' : null)}
      />

      <div className="space-y-2 px-1 pt-3 text-center">
        <p className="text-sm text-muted">For your own situation, ask a scholar you trust.</p>
        <UnreviewedLine />
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="mt-2 min-h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          Clear amounts
        </button>
      </div>

      <ConfirmSheet
        open={confirmClear}
        title="Clear your amounts?"
        message="Your amounts and choices go. Prices, currency and your zakat year stay."
        confirmLabel="Clear amounts"
        onConfirm={() => {
          z.resetInputs();
          // Keep the reckoning and reminder: they are settings, not amounts
          if (input.reckoning === 'tola') z.setOption(ZAKAT_OPTIONS.reckoning, 'tola');
          if (z.options[ZAKAT_OPTIONS.hawlReminder] === 'on') z.setOption(ZAKAT_OPTIONS.hawlReminder, 'on');
          setFormKey((k) => k + 1);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}

// ---------- nisab ----------

const RECKONING_OPTIONS: { value: Reckoning; label: string }[] = [
  { value: 'dinar', label: '85 g · 595 g' },
  { value: 'tola', label: '87.48 g · 612.36 g' },
];

const BASIS_OPTIONS: { value: NisabBasis; label: string }[] = [
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
];

function NisabCard({
  basis,
  onBasis,
  reckoning,
  onReckoning,
  result,
  money,
}: {
  basis: NisabBasis;
  onBasis: (b: NisabBasis) => void;
  reckoning: Reckoning;
  onReckoning: (r: Reckoning) => void;
  result: ZakatResult;
  money: (n: number) => string;
}) {
  const metal = (b: NisabBasis) => {
    const grams = NISAB_GRAMS[reckoning][b];
    const other = NISAB_GRAMS[reckoning === 'dinar' ? 'tola' : 'dinar'][b];
    const nisab = result[b].nisab;
    return (
      <div
        className={cn('rounded-xl border px-3.5 py-3', b === basis ? 'border-teal/50 bg-teal/[0.06]' : 'border-foreground/10')}
        data-nisab={b}
      >
        <p className="text-xs font-semibold text-muted">{b === 'gold' ? 'Gold' : 'Silver'}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{formatGrams(grams)}</p>
        <p className="text-sm tabular-nums text-foreground">{nisab === null ? <span className="text-muted">Add the price</span> : money(nisab)}</p>
        <p className="mt-1 text-xs leading-snug text-muted">
          {b === 'gold' ? '20 mithqal' : '200 dirhams'}. {formatGrams(other)} in the {reckoning === 'dinar' ? 'tola' : 'dinar'} reckoning.
        </p>
      </div>
    );
  };
  return (
    <Card>
      <p className="text-sm text-muted">The least wealth on which zakat is due. Both measures, side by side:</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {metal('gold')}
        {metal('silver')}
      </div>
      <NoteBlock id="nisab-metals" summary="Where nisab comes from" />

      <p className="mt-4 text-sm font-semibold text-foreground">Gram figures</p>
      <SegmentedControl<Reckoning> className="mt-2" options={RECKONING_OPTIONS} value={reckoning} onChange={onReckoning} />
      <NoteBlock id="nisab-grams" summary="Why there are two sets of figures" />

      <p className="mt-4 text-sm font-semibold text-foreground">Measure your wealth against</p>
      <SegmentedControl<NisabBasis> className="mt-2" options={BASIS_OPTIONS} value={basis} onChange={onBasis} />
      <NoteBlock id="basis" summary="Gold or silver: where scholars differ" />
    </Card>
  );
}

// ---------- result ----------

const MISSING_TEXT: Record<Missing, string> = {
  'gold-price': 'Add the gold price to value your gold.',
  'silver-price': 'Add the silver price to value your silver.',
  'worn-choice': 'Choose whether to count the jewellery you wear.',
  'debt-choice': 'Choose whether to take your debts off.',
};

const BASIS_NAME: Record<NisabBasis, string> = { gold: 'gold', silver: 'silver' };

function headline(r: BasisResult, net: number, money: (n: number) => string): string {
  const on = `On the ${BASIS_NAME[r.basis]} basis`;
  if (r.status === 'at-or-above-nisab') return `${on}, zakat on ${money(net)} is ${money(r.due)}.`;
  if (r.status === 'below-nisab') return `${on}, ${money(net)} is below nisab of ${money(r.nisab ?? 0)}, so no zakat is due on it.`;
  return `${on}: add the ${BASIS_NAME[r.basis]} price to compare.`;
}

function ResultCard({ result, basis, money }: { result: ZakatResult; basis: NisabBasis; money: (n: number) => string }) {
  const chosen = result[basis];
  const other = result[basis === 'gold' ? 'silver' : 'gold'];

  if (chosen.status === 'nothing') {
    return (
      <Card className="text-sm text-muted">
        <span data-testid="zakat-result">Enter what you have above and the result appears here.</span>
      </Card>
    );
  }

  const blocked = result.missing.length > 0;
  return (
    <div className="tactile-card rounded-2xl bg-card p-5" data-testid="zakat-result">
      {/* Only the outcome is announced as amounts change, not the whole breakdown */}
      <div aria-live="polite" aria-atomic="true">
      {blocked ? (
        <div>
          <p className="text-base font-bold text-foreground">A little more first</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {result.missing.map((m) => (
              <li key={m}>{MISSING_TEXT[m]}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-muted">Measured against {BASIS_NAME[basis]}</p>
          <p className="mt-1 text-lg font-bold leading-snug text-foreground" data-testid="zakat-headline">
            {headline(chosen, result.net, money)}
          </p>
          {chosen.status === 'at-or-above-nisab' && (
            <p className="mt-1 text-3xl font-bold tabular-nums text-teal" data-testid="zakat-due">
              {money(chosen.due)}
            </p>
          )}
          <p className="mt-3 border-t border-foreground/10 pt-3 text-sm text-muted" data-testid="zakat-other-basis">
            {headline(other, result.net, money)}
          </p>
        </>
      )}
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-foreground/10 pt-3 text-sm">
        {(
          [
            ['Cash and savings', result.lines.cash],
            ['Gold', result.lines.gold],
            ['Silver', result.lines.silver],
            ['Goods for sale', result.lines.tradeGoods],
            ['Owed to you', result.lines.receivables],
          ] as const
        )
          .filter(([, v]) => v > 0)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums text-foreground">{money(v)}</dd>
            </div>
          ))}
        {result.deducted > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Debts taken off</dt>
            <dd className="tabular-nums text-foreground">−{money(result.deducted)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold">
          <dt className="text-foreground">Counted</dt>
          <dd className="tabular-nums text-foreground">{money(result.net)}</dd>
        </div>
      </dl>
      <NoteBlock id="rate" summary="Why 2.5%" />
      <NoteBlock id="combining" summary="Adding it all together" />
    </div>
  );
}

// ---------- hawl ----------

function HawlCard({
  startIso,
  onStart,
  offset,
  reminderOn,
  onReminder,
}: {
  startIso: string | null;
  onStart: (iso: string | null) => void;
  offset: number;
  reminderOn: boolean;
  onReminder: (on: boolean) => void;
}) {
  const today = todayIso();
  const next = startIso ? nextHawlDate(startIso, today, offset) : null;
  const native = hawlReminderSupported();
  const [denied, setDenied] = useState(false);

  // Keep the OS reminder in step (native only; a no-op when nothing changed)
  useEffect(() => {
    if (!native) return;
    syncHawlReminder({ enabled: reminderOn, hawlStartIso: startIso, offset }).catch(() => {});
  }, [native, reminderOn, startIso, offset]);

  return (
    <Card>
      <label htmlFor="zakat-hawl" className="block text-sm font-medium text-foreground">
        The day your wealth first reached nisab
      </label>
      <input
        id="zakat-hawl"
        data-testid="zakat-hawl"
        type="date"
        max={today}
        value={startIso ?? ''}
        onChange={(e) => onStart(e.target.value || null)}
        className="mt-1.5 w-full rounded-xl border border-foreground/15 bg-card px-3.5 py-2.5 text-base text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
      />
      {startIso && <p className="mt-1.5 text-xs text-muted">{hijriLabel(startIso, offset)}, expected</p>}

      {next && (
        <div className="mt-4 rounded-xl bg-gold/10 px-3.5 py-3" data-testid="zakat-next-hawl">
          <p className="text-xs font-semibold text-gold-deep">Your zakat year is expected to complete on</p>
          <p className="mt-0.5 text-base font-bold text-foreground">{formatCivilDate(next.iso)}</p>
          <p className="text-sm text-muted">
            {hijriLabel(next.iso, offset)}
            {(() => {
              const d = daysBetween(today, next.iso);
              return d === 0 ? ' · today' : d === 1 ? ' · tomorrow' : ` · in ${d} days`;
            })()}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-muted">
            Calculated, not sighted. If your local month started a day earlier or later, set the Hijri day offset in prayer settings.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Remind me on the day</p>
          <p className="text-xs text-muted">
            {native ? 'A notification at 9:00 on the expected day.' : 'Reminders need the app. The date is here whenever you come back.'}
          </p>
          {native && reminderOn && !next && <p className="mt-1 text-xs text-muted">Add the date above and the reminder is set.</p>}
          {denied && <p className="mt-1 text-xs text-gold-deep">Notifications are off for Takrar. You can turn them on in your phone&apos;s settings.</p>}
        </div>
        {native && (
          <Toggle
            label="Remind me on the day"
            on={reminderOn}
            onToggle={async () => {
              if (reminderOn) return onReminder(false);
              const ok = await requestHawlPermission();
              setDenied(!ok);
              if (ok) onReminder(true);
            }}
          />
        )}
      </div>

      <NoteBlock id="hawl" summary="Why a lunar year" />
      <NoteBlock id="hawl-dip" summary="If your wealth dips during the year" />
    </Card>
  );
}
