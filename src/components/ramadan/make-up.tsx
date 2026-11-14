'use client';

import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { formatCivil } from '@/lib/hijri/calendar';
import { formatHijri, toHijri } from '@/lib/hijri/convert';
import { makeUpList } from '@/lib/worship/ramadan';
import { useWorshipStore } from '@/stores/worship-store';
import { cn } from '@/lib/cn';

/**
 * Fasts to make up: every day marked "to make up", across Ramadans, with the
 * make-up fasts done ticked off oldest first. The count carries on after
 * Ramadan; fidya and kaffara are not worked out.
 */
export default function MakeUp({ offset }: { offset: number }) {
  const fasts = useWorshipStore((s) => s.fasts);
  const pauses = useWorshipStore((s) => s.pauses);
  const madeUp = useWorshipStore((s) => s.madeUp.fasts);
  const addMadeUp = useWorshipStore((s) => s.addMadeUp);
  const list = makeUpList(fasts, madeUp, pauses);

  return (
    <section data-make-up>
      <Card className="py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Fasts to make up</h2>
          <span className="text-2xl font-bold tabular-nums text-foreground" data-make-up-left>{list.left}</span>
        </div>
        {list.days.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing to make up. Days you mark &ldquo;To make up&rdquo; are listed here.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              {list.left === 0 ? 'All made up. May Allah accept them.' : 'Oldest first. Each make-up fast ticks off the next day.'}
            </p>
            <ul className="mt-3 max-h-64 divide-y divide-foreground/5 overflow-y-auto">
              {list.days.map((d) => (
                <li key={d.iso} className="flex min-h-11 items-center gap-3 py-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      d.done ? 'border-teal bg-teal text-on-teal' : 'border-foreground/25',
                    )}
                  >
                    {d.done && <CheckIcon size={12} />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className={cn('block', d.done ? 'text-muted' : 'text-foreground')}>{formatCivil(d.iso)}</span>
                    <span className="block text-xs text-muted">{formatHijri(toHijri(d.iso, offset))}</span>
                  </span>
                  <span className="sr-only">{d.done ? 'made up' : 'to make up'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={list.left === 0}
            onClick={() => addMadeUp('fasts', 1)}
            className="pressable min-h-12 flex-1 rounded-xl border border-teal/30 bg-teal/5 px-4 text-sm font-semibold text-teal disabled:opacity-40"
            data-made-up
          >
            I made up a fast
          </button>
          {madeUp > 0 && (
            <button
              type="button"
              onClick={() => addMadeUp('fasts', -1)}
              className="min-h-12 rounded-xl px-4 text-sm font-semibold text-muted hover:text-foreground"
            >
              Undo
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Fidya and kaffara are not worked out here. For your own situation, ask a scholar you trust.
        </p>
      </Card>
    </section>
  );
}
