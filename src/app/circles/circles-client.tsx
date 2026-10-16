'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import BackButton from '@/components/ui/back-button';
import BottomSheet from '@/components/ui/bottom-sheet';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import Button from '@/components/ui/button';
import ProgressBar from '@/components/ui/progress-bar';
import UserButton from '@/components/auth/user-button';
import Link from '@/components/app-link';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { claimJuz, createCircle, dropJuz, joinCircle, leaveCircle, loadCircle, myCircles, nextRound, setJuzDone, type CircleView } from '@/lib/circles';
import type { CircleRow } from '@/lib/supabase/types';

const NAME_KEY = 'circle-display-name';
const REFRESH_MS = 20_000;

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/no circle with that code/.test(m)) return 'No circle has that code. Check it and try again.';
  if (/does not exist|schema cache|function/i.test(m)) return 'Circles aren\'t switched on yet.';
  return 'That didn\'t work. Check your connection and try again.';
}

/**
 * Khatm circles (roadmap #18): read the Quran together. A family or halaqah shares
 * a circle by its code; each member claims juz and marks them read; when all 30
 * are read, the circle starts its next khatm.
 */
export default function CirclesClient() {
  const auth = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get('c');

  // Nothing below renders until the session is known (so it only ever renders in the browser)
  if (auth.loading) return <Shell title="Khatm circles"><div className="h-24 animate-pulse rounded-2xl bg-foreground/5" /></Shell>;
  if (!auth.user) {
    return (
      <Shell title="Khatm circles">
        <div className="rounded-2xl bg-card p-5">
          <p className="text-lg font-bold text-foreground">Read the Quran together</p>
          <p className="mt-1 text-sm text-muted">
            Start a circle with family or your halaqah and share its code. Everyone claims juz, marks them read, and the circle
            finishes the khatm together. Circles need an account so the group can see each other&apos;s progress.
          </p>
          <div className="mt-4 flex items-center gap-3"><UserButton /><span className="text-sm text-muted">to start or join one</span></div>
        </div>
      </Shell>
    );
  }
  return openId
    ? <CircleDetail id={openId} onLeft={() => router.replace('/circles')} />
    : <CircleList onOpen={(id) => router.push(`/circles?c=${id}`)} />;
}

function Shell({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/khatm" />
          <span className="truncate text-sm font-semibold text-teal">{title}</span>
          <span className="flex w-11 justify-end">{right}</span>
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[var(--tabbar-clearance)]">{children}</main>
    </div>
  );
}

function useName() {
  // Client-only: the circle screens render once the session is known
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } });
  const save = (n: string) => { setName(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };
  return [name, save] as const;
}

function CircleList({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<(CircleRow & { done: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const [circleName, setCircleName] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useName();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    myCircles().then(setList).catch((e) => { setList([]); setError(errorText(e)); });
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = sheet === 'create' ? await createCircle(circleName, name) : await joinCircle(code, name);
      haptic.success();
      onOpen(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Khatm circles">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => { setError(null); setSheet('create'); }}>Start a circle</Button>
        <Button variant="secondary" onClick={() => { setError(null); setSheet('join'); }}>Join with a code</Button>
      </div>
      {error && !sheet && <p className="text-sm text-red-500">{error}</p>}
      {list === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-foreground/5" />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">You&apos;re not in a circle yet. Start one, or join with the code someone shared.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className="tactile-chip block w-full rounded-2xl bg-card p-4 text-left">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{c.name}</span>
                  <span className="text-xs text-muted">Khatm {c.round} · {c.done}/30</span>
                </span>
                <ProgressBar value={(c.done / 30) * 100} className="mt-2" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'create' ? 'Start a circle' : 'Join a circle'} doneButton>
        <form className="space-y-3 pb-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {sheet === 'create' ? (
            <label className="block text-xs font-medium text-muted">Circle name
              <input value={circleName} onChange={(e) => setCircleName(e.target.value)} maxLength={60} required placeholder="Family khatm, Ramadan halaqah…" className="mt-1 w-full rounded-xl border border-foreground/15 bg-transparent px-3 py-2.5 text-base text-foreground" />
            </label>
          ) : (
            <label className="block text-xs font-medium text-muted">Code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} required placeholder="6 letters and numbers" className="mt-1 w-full rounded-xl border border-foreground/15 bg-transparent px-3 py-2.5 font-mono text-base uppercase tracking-widest text-foreground" />
            </label>
          )}
          <label className="block text-xs font-medium text-muted">Your name in the circle
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="How the others will see you" className="mt-1 w-full rounded-xl border border-foreground/15 bg-transparent px-3 py-2.5 text-base text-foreground" />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'One moment…' : sheet === 'create' ? 'Start it' : 'Join'}</Button>
        </form>
      </BottomSheet>
    </Shell>
  );
}

function CircleDetail({ id, onLeft }: { id: string; onLeft: () => void }) {
  const [view, setView] = useState<CircleView | null | undefined>(undefined);
  const [me, setMe] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => { loadCircle(id).then(setView).catch(() => setView(null)); }, [id]);
  useEffect(() => {
    void import('@/lib/circles').then((m) => m.myId()).then(setMe);
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const onFocus = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);

  if (view === undefined) return <Shell title="Circle"><div className="h-64 animate-pulse rounded-2xl bg-foreground/5" /></Shell>;
  if (view === null) return <Shell title="Circle"><p className="py-10 text-center text-sm text-muted">This circle couldn&apos;t load. You may have left it.</p></Shell>;

  const { circle, members, claims } = view;
  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.display_name ?? 'Someone';
  const claimOf = (juz: number) => claims.find((c) => c.juz === juz);
  const done = claims.filter((c) => c.done).length;
  const mine = claims.filter((c) => c.user_id === me);
  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); haptic.selection(); refresh(); } catch (e) { setError(errorText(e)); refresh(); }
  };
  const share = async () => {
    const text = `Join my khatm circle "${circle.name}" on Takrar. Code: ${circle.join_code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setShared(true); }
    } catch { /* cancelled */ }
  };
  const picked = pick !== null ? claimOf(pick) : undefined;

  return (
    <Shell title={circle.name}>
      <div className="rounded-2xl bg-card p-5" data-circle={circle.id}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Khatm {circle.round}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{done === 30 ? 'Khatm complete' : `${done} of 30 juz read`}</p>
        <ProgressBar value={(done / 30) * 100} className="mt-3" />
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">Code <span className="font-mono text-sm font-semibold tracking-widest text-foreground">{circle.join_code}</span></p>
          <button type="button" onClick={() => void share()} className="min-h-11 rounded-full bg-teal/10 px-4 text-xs font-semibold text-teal">{shared ? 'Copied' : 'Invite'}</button>
        </div>
        {done === 30 && (circle.created_by === me || circle.created_by === null) && (
          <Button className="mt-4 w-full" onClick={() => act(() => nextRound(circle))}>Start khatm {circle.round + 1}</Button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Tap a juz to claim it. {mine.length > 0 && `You have ${mine.length}.`}</p>
        <div className="grid grid-cols-5 gap-1.5" role="list">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => {
            const c = claimOf(juz);
            const isMine = c?.user_id === me;
            return (
              <button
                key={juz}
                type="button"
                role="listitem"
                onClick={() => (c && !isMine ? null : setPick(juz))}
                aria-label={`Juz ${juz}: ${c ? `${c.done ? 'read' : 'claimed'} by ${isMine ? 'you' : nameOf(c.user_id)}` : 'free'}`}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-center',
                  !c && 'bg-card text-foreground',
                  c && !c.done && (isMine ? 'bg-gold/25 text-gold-deep' : 'bg-gold/10 text-foreground/80'),
                  c?.done && (isMine ? 'bg-teal text-on-teal' : 'bg-teal/25 text-foreground'),
                )}
                data-juz={juz}
              >
                <span className="text-sm font-bold">{juz}</span>
                <span className="w-full truncate text-[9px] leading-tight">{c ? (isMine ? 'You' : nameOf(c.user_id)) : ''}{c?.done ? ' ✓' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4">
        <p className="text-xs font-medium text-muted">In this circle</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.user_id} className="rounded-full bg-foreground/[0.05] px-3 py-1 text-xs text-foreground">
              {m.display_name}{m.user_id === me && ' (you)'} · {claims.filter((c) => c.user_id === m.user_id && c.done).length}/{claims.filter((c) => c.user_id === m.user_id).length}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={() => setConfirmLeave(true)} className="min-h-11 w-full text-sm font-semibold text-muted hover:text-red-500">Leave this circle</button>

      <BottomSheet open={pick !== null} onClose={() => setPick(null)} title={pick ? `Juz ${pick}` : ''} doneButton>
        <div className="space-y-2 pb-2">
          {!picked ? (
            <Button className="w-full" onClick={() => { const j = pick!; setPick(null); void act(() => claimJuz(circle.id, circle.round, j)); }}>Claim it</Button>
          ) : (
            <>
              <Button className="w-full" onClick={() => { const j = pick!; setPick(null); void act(() => setJuzDone(circle.id, circle.round, j, !picked.done)); }}>
                {picked.done ? 'Mark as not read yet' : 'I\'ve read it'}
              </Button>
              <button type="button" onClick={() => { const j = pick!; setPick(null); void act(() => dropJuz(circle.id, circle.round, j)); }} className="min-h-11 w-full text-sm font-semibold text-muted">
                Give it back
              </button>
            </>
          )}
          {pick !== null && <Link href={`/mushaf`} className="block min-h-11 py-3 text-center text-sm text-teal">Open the mushaf</Link>}
        </div>
      </BottomSheet>
      <ConfirmSheet
        open={confirmLeave}
        title="Leave this circle?"
        message="Your claimed juz stay with the circle's record. You can rejoin with the code."
        confirmLabel="Leave"
        destructive
        onConfirm={() => { setConfirmLeave(false); void leaveCircle(circle.id).then(onLeft).catch((e) => setError(errorText(e))); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </Shell>
  );
}
