'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import SegmentedControl from '@/components/ui/segmented-control';
import { ArrowRightIcon, CoinsIcon } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/skeleton';
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
import { AmountField, ChoiceChips, ChoiceQuestion, SectionTitle, Toggle, inputClass } from './fields';

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
        {client ? (
          <Calculator />
        ) : (
          <>
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

/** Amount fields the result can wait on, with the line that sends the user back to each */
const FIELD_FIX: Record<string, string> = {
  'zakat-in-price-gold': 'Fix the gold price.',
  'zakat-in-price-silver': 'Fix the silver price.',
  'zakat-in-cash': 'Fix the amount in Cash and savings.',
  'zakat-in-goldGrams': 'Fix the amount in Gold you keep.',
  'zakat-in-silverGrams': 'Fix the amount in Silver you keep.',
  'zakat-in-tradeGoods': 'Fix the amount in Goods for sale.',
  'zakat-in-receivables': 'Fix the amount in Money owed to you.',
  'zakat-in-goldWornGrams': 'Fix the amount of gold jewellery.',
  'zakat-in-silverWornGrams': 'Fix the amount of silver jewellery.',
  'zakat-in-debts': 'Fix the amount in Debts due now.',
};
const FIELD_ORDER = Object.keys(FIELD_FIX);

function Calculator() {
  const z = useZakatStore();
  const hijriOffset = usePrayerStore((s) => s.hijriOffset);
  const [confirmClear, setConfirmClear] = useState(false);
  // Fields keep their own typing state; bumping this remounts them after a clear
  const [formKey, setFormKey] = useState(0);
  // Fields whose text doesn't read as an amount right now (the store still holds the last good one)
  const [invalid, setInvalid] = useState<string[]>([]);
  const onValidity = useCallback((id: string, bad: boolean) => {
    setInvalid((list) => (bad === list.includes(id) ? list : bad ? [...list, id] : list.filter((x) => x !== id)));
  }, []);

  const input = useMemo(() => inputFromStore(z), [z]);
  const result = useMemo(() => calculateZakat(input), [input]);
  const currency = z.currency;
  const money = (n: number) => formatMoney(n, currency);
  const unit = currency.trim() || undefined;
  const field = (id: ZakatField) => ({
    value: z.inputs[id],
    onChange: (n: number | null) => z.setInput(id, n),
    testId: `zakat-${id}`,
    inputId: `zakat-in-${id}`,
    onValidity,
  });

  // What the result is waiting on, in page order, each with where to go to sort it
  const todo: Todo[] = [
    ...FIELD_ORDER.filter((id) => invalid.includes(id)).map((id) => ({ key: id, text: FIELD_FIX[id], target: `#${id}` })),
    ...result.missing.map((m) => ({ key: m, text: MISSING_TEXT[m], target: MISSING_TARGET[m] })),
  ];
  if (!todo.length && result[z.nisabBasis].status === 'incomplete') {
    const b = z.nisabBasis;
    todo.push({ key: `${b}-basis`, text: `Add the ${b} price to compare with nisab.`, target: `#zakat-in-price-${b}` });
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
            <CoinsIcon size={18} />
          </span>
          <p className="text-base font-bold text-foreground">Work out your zakat</p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          For cash, gold, silver, goods for sale and money owed to you. Everything you enter stays on this phone.
        </p>
      </Card>

      <div key={formKey} className="space-y-3">
        {/* ---------- prices ---------- */}
        <SectionTitle>Today&apos;s prices</SectionTitle>
        <Card className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            There&apos;s no price feed here, so enter today&apos;s prices from a source you trust. They stay until you change them.
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
              className={cn(inputClass, 'mt-1.5 w-28')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AmountField
              label="Gold, per gram"
              value={z.pricePerGram.gold}
              onChange={(n) => z.setPrice('gold', n)}
              unit={unit}
              testId="zakat-price-gold"
              inputId="zakat-in-price-gold"
              onValidity={onValidity}
            />
            <AmountField
              label="Silver, per gram"
              value={z.pricePerGram.silver}
              onChange={(n) => z.setPrice('silver', n)}
              unit={unit}
              testId="zakat-price-silver"
              inputId="zakat-in-price-silver"
              onValidity={onValidity}
            />
          </div>
        </Card>

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
            <NoteBlock id="trade-goods" summary="Goods for sale: how they are counted" />
          </div>
          <div>
            <AmountField label="Money owed to you" hint="That you expect to be repaid" unit={unit} {...field('receivables')} />
            <NoteBlock id="receivables" summary="Money owed: where scholars differ" />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-foreground">Jewellery you wear</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <AmountField label="Gold" unit="g" {...field('goldWornGrams')} />
            <AmountField label="Silver" unit="g" {...field('silverWornGrams')} />
          </div>
          <ChoiceQuestion>Count worn jewellery?</ChoiceQuestion>
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
          <NoteBlock id="worn-jewellery" summary="Worn jewellery: where scholars differ" open={result.missing.includes('worn-choice')} />
        </Card>

        {/* ---------- debts ---------- */}
        <SectionTitle>What you owe</SectionTitle>
        <Card>
          <AmountField label="Debts due now" hint="Money you owe that is due to be paid" unit={unit} {...field('debts')} />
          <ChoiceQuestion>Take debts off before comparing with nisab?</ChoiceQuestion>
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
          <NoteBlock id="debts" summary="Debts: where scholars differ" open={result.missing.includes('debt-choice')} />
        </Card>
      </div>

      {/* ---------- nisab: just above the result, where the comparison is made ---------- */}
      <SectionTitle>Nisab</SectionTitle>
      <NisabCard
        basis={z.nisabBasis}
        onBasis={z.setNisabBasis}
        reckoning={input.reckoning}
        onReckoning={(r) => z.setOption(ZAKAT_OPTIONS.reckoning, r)}
        result={result}
        money={money}
      />

      {/* ---------- result ---------- */}
      <SectionTitle>Result</SectionTitle>
      <ResultCard result={result} basis={z.nisabBasis} money={money} todo={todo} />

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
        <p className="text-sm leading-relaxed text-muted">
          Not covered here: livestock, crops, and business cases such as shares, pensions and long-term debts. For those, and for
          your own situation, ask a scholar you trust.
        </p>
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
  { value: 'dinar', label: 'Dinar weights' },
  { value: 'tola', label: 'Tola weights' },
];

/** Silver first, as the tiles are: it is the default basis */
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
    const amount = nisab === null ? null : money(nisab);
    const chosen = b === basis;
    return (
      <div
        className={cn(
          'min-w-0 rounded-xl border px-3.5 py-3 transition-colors duration-200',
          chosen ? 'border-teal bg-teal/[0.08]' : 'border-foreground/10 bg-card',
        )}
        data-nisab={b}
      >
        <p className={cn('text-xs font-semibold', chosen ? 'text-teal' : 'text-muted')}>{b === 'gold' ? 'Gold' : 'Silver'}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{formatGrams(grams)}</p>
        <p
          className={cn(
            'overflow-hidden text-ellipsis whitespace-nowrap tabular-nums text-foreground',
            amount && amount.length > 11 ? 'text-[13px]' : 'text-sm',
          )}
        >
          {amount ?? <span className="text-muted">Add the price</span>}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">
          {b === 'gold' ? '20 mithqal' : '200 dirhams'}. {formatGrams(other)} in {reckoning === 'dinar' ? 'tola' : 'dinar'} weights.
        </p>
      </div>
    );
  };
  return (
    <Card>
      <p className="text-sm text-muted">The least wealth on which zakat is due, by both measures.</p>
      <p className="mt-4 text-sm font-semibold text-foreground">Measure your wealth against</p>
      <SegmentedControl<NisabBasis> className="mt-2" options={BASIS_OPTIONS} value={basis} onChange={onBasis} />
      <div className="mt-3 grid grid-cols-2 gap-3">
        {metal('silver')}
        {metal('gold')}
      </div>
      <NoteBlock id="basis" summary="Gold or silver: where scholars differ" />
      <NoteBlock id="nisab-metals" summary="Where nisab comes from" />

      <p className="mt-4 text-sm font-semibold text-foreground">Gram figures</p>
      <SegmentedControl<Reckoning> className="mt-2" options={RECKONING_OPTIONS} value={reckoning} onChange={onReckoning} />
      <NoteBlock id="nisab-grams" summary="Why there are two sets of figures" />
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

/** Where each missing piece is asked for */
const MISSING_TARGET: Record<Missing, string> = {
  'gold-price': '#zakat-in-price-gold',
  'silver-price': '#zakat-in-price-silver',
  'worn-choice': '[data-choice="worn-jewellery"] [role="radio"]',
  'debt-choice': '[data-choice="debts"] [role="radio"]',
};

interface Todo {
  key: string;
  text: string;
  /** CSS selector for the field or choice to bring into view and focus */
  target: string;
}

function goTo(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}

const otherOf = (b: NisabBasis): NisabBasis => (b === 'gold' ? 'silver' : 'gold');

/** The outcome on one basis as one plain sentence (read out by screen readers) */
function sentence(r: BasisResult, net: number, money: (n: number) => string): string {
  const on = `On the ${r.basis} basis`;
  if (r.status === 'at-or-above-nisab') return `${on}, zakat on ${money(net)} is ${money(r.due)}.`;
  if (r.status === 'below-nisab') {
    return net === 0
      ? `${on}, nothing is left to count after debts, so no zakat is due.`
      : `${on}, ${money(net)} is below nisab of ${money(r.nisab ?? 0)}, so no zakat is due on it.`;
  }
  return `${on}: add the ${r.basis} price to compare.`;
}

/** The other basis, said briefly: only spelt out when its outcome differs */
function otherLine(chosen: BasisResult, other: BasisResult, money: (n: number) => string): string {
  if (other.status === 'incomplete') return `On the ${other.basis} basis: add the ${other.basis} price to compare.`;
  if (other.status === chosen.status) return `The same on the ${other.basis} basis.`;
  if (other.status === 'below-nisab') return `On the ${other.basis} basis nothing is due: its nisab is ${money(other.nisab ?? 0)}.`;
  return `On the ${other.basis} basis ${money(other.due)} is due: its nisab is ${money(other.nisab ?? 0)}.`;
}

function ResultCard({
  result,
  basis,
  money,
  todo,
}: {
  result: ZakatResult;
  basis: NisabBasis;
  money: (n: number) => string;
  todo: Todo[];
}) {
  const chosen = result[basis];
  const other = result[otherOf(basis)];
  const blocked = todo.length > 0;

  if (chosen.status === 'nothing' && !blocked) {
    return (
      <Card className="text-sm text-muted">
        <span data-testid="zakat-result">Enter what you have above and the result appears here.</span>
      </Card>
    );
  }

  const showBreakdown = result.assets > 0 || result.deducted > 0;
  return (
    <div className="tactile-card rounded-2xl bg-card p-5" data-testid="zakat-result">
      {blocked ? (
        <div aria-live="polite">
          <p className="text-base font-bold text-foreground">A little more first</p>
          <ul className="mt-1">
            {todo.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => goTo(t.target)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left text-sm font-medium text-teal hover:underline hover:underline-offset-2"
                >
                  <span>{t.text}</span>
                  <ArrowRightIcon size={16} className="shrink-0 -rotate-90 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {/* Only the outcome is announced as amounts change, as whole sentences */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {sentence(chosen, result.net, money)} {otherLine(chosen, other, money)}
          </p>
          <div aria-hidden data-testid="zakat-headline">
            {chosen.status === 'at-or-above-nisab' ? (
              <>
                <p className="text-xs font-semibold text-muted">Zakat due, measured against {basis}</p>
                <p className="mt-1 text-4xl font-bold leading-none tabular-nums text-teal" data-testid="zakat-due">
                  {money(chosen.due)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">2.5% of {money(result.net)}</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-muted">Measured against {basis}</p>
                <p className="mt-1 text-lg font-bold leading-snug text-foreground">No zakat due</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">
                  {result.net === 0
                    ? 'After debts, nothing is left to count.'
                    : `${money(result.net)} is below the ${basis} nisab of ${money(chosen.nisab ?? 0)}.`}
                </p>
              </>
            )}
          </div>
          <p aria-hidden className="mt-3 border-t border-foreground/10 pt-3 text-sm text-muted" data-testid="zakat-other-basis">
            {otherLine(chosen, other, money)}
          </p>
        </>
      )}

      {showBreakdown && (
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
          <div className={cn('mt-1.5 flex justify-between gap-3 border-t border-foreground/10 pt-1.5', !blocked && 'font-semibold')}>
            <dt className={blocked ? 'text-muted' : 'text-foreground'}>{blocked ? 'Counted so far' : 'Counted'}</dt>
            <dd className={cn('tabular-nums', blocked ? 'text-muted' : 'text-foreground')}>{money(result.net)}</dd>
          </div>
        </dl>
      )}
      <NoteBlock id="rate" summary="Why 2.5%" />
      <NoteBlock id="combining" summary="Adding it all together" />
    </div>
  );
}

// ---------- hawl ----------

/** Today's date, kept current when the app comes back to the front or is left open past midnight */
function useToday(): string {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const check = () => setToday((t) => (t === todayIso() ? t : todayIso()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}

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
  const today = useToday();
  const next = startIso ? nextHawlDate(startIso, today, offset) : null;
  const startLabel = startIso ? hijriLabel(startIso, offset) : '';
  const native = hawlReminderSupported();
  const [denied, setDenied] = useState(false);

  // Keep the OS reminder in step (native only; a no-op when nothing changed)
  useEffect(() => {
    if (!native) return;
    syncHawlReminder({ enabled: reminderOn, hawlStartIso: startIso, offset }).catch(() => {});
    // `today` is here so a new day (the app left open, or reopened after the reminder fired) re-arms it
  }, [native, reminderOn, startIso, offset, today]);

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
        className={cn(inputClass, 'mt-1.5 block min-h-[46px] w-full appearance-none')}
      />
      {startLabel && <p className="mt-1.5 text-xs text-muted">{startLabel}, expected</p>}
      {startIso && !next && (
        <p className="mt-1.5 text-xs font-medium text-gold-deep" data-testid="zakat-hawl-problem">
          That date can&apos;t be placed in the Hijri calendar. Check the year.
        </p>
      )}

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
