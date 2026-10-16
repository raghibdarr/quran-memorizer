'use client';

// The recitation player behind Read & listen (roadmap #01). One module-level
// session, so playback outlives the screen: it can run on to the end of a juz
// (the screen follows it from surah to surah) and, in the Android app, keeps
// playing with the screen off.
//
// Two backends with one surface:
//   native — Android: the whole queue goes to Media3 (android/…/audio/), which plays
//            it with no JavaScript involved and shows lock-screen controls
//   web    — everywhere else: the HTML audio controller, one ayah at a time, with
//            Media Session metadata for the browser's own media controls

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { audioController } from './audio';
import { getAudioUrl } from './quran-data';
import { isSurahAudio, surahAudioFallback, RECITERS } from './reciters';
import { ayahAt, buildQueue, msIntoAyah, type AyahRef, type QueueItem, type SurahAudioIndex } from './recitation-queue';

export interface PlaybackPlan {
  ayahs: AyahRef[];
  repeatEach: number;
  /** Silence after each play, ms */
  pauseMs: number;
  /** Loop the whole list until stopped */
  loop: boolean;
  reciter: string;
  rate: number;
  surahName: (surah: number) => string;
  /** A downloaded copy of a file, if there is one (roadmap #02) */
  localUrl?: (url: string) => string;
}

export type SleepMode = { kind: 'off' } | { kind: 'timer'; endsAt: number } | { kind: 'item' };

export interface RecitationState {
  active: boolean;
  playing: boolean;
  buffering: boolean;
  /** What's playing now */
  surah: number | null;
  ayah: number | null;
  rep: number;
  sleep: SleepMode;
  backend: 'native' | 'web';
}

interface NativePlugin {
  setQueue(o: { items: unknown[]; startIndex: number; pauseMs: number; loop: boolean; rate: number; autoplay?: boolean }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekToItem(o: { index: number; positionMs: number }): Promise<void>;
  setRate(o: { rate: number }): Promise<void>;
  setSleepTimer(o: { minutes: number; fadeMs: number }): Promise<void>;
  getState(): Promise<{ index: number; positionMs: number; playing: boolean; count: number }>;
  addListener(event: 'item', fn: (e: { index: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'state', fn: (e: { playing: boolean; buffering: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'progress', fn: (e: { index: number; positionMs: number; durationMs: number; at: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'ended', fn: (e: { reason: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', fn: (e: { message: string }) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<NativePlugin>('RecitationPlayer');
export const nativeRecitation = (): boolean =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('RecitationPlayer');

const FADE_MS = 8000;
const GAP_BETWEEN_AYAHS_MS = 300;
const GAP_BETWEEN_REPEATS_MS = 600;

// ---------- shared state ----------

let state: RecitationState = {
  active: false, playing: false, buffering: false, surah: null, ayah: null, rep: 0, sleep: { kind: 'off' }, backend: 'web',
};
const listeners = new Set<() => void>();
function set(patch: Partial<RecitationState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getRecitationState(): RecitationState { return state; }
export function subscribeRecitation(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---------- surah-audio index (QUD reciters) ----------

const indexCache = new Map<string, Promise<SurahAudioIndex | null>>();
export function loadAudioIndex(reciter: string): Promise<SurahAudioIndex | null> {
  if (!isSurahAudio(reciter)) return Promise.resolve(null);
  let p = indexCache.get(reciter);
  if (!p) {
    p = fetch(`/segments/${reciter}/audio-index.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    p.then((v) => { if (!v) indexCache.delete(reciter); });
    indexCache.set(reciter, p);
  }
  return p;
}

// ---------- native backend ----------

let queue: QueueItem[] = [];
let audioIndex: SurahAudioIndex | null = null;
let progress = { index: -1, positionMs: 0, durationMs: -1, at: 0 };
let nativeRate = 1;
let nativeWired = false;

function wireNative() {
  if (nativeWired) return;
  nativeWired = true;
  void Native.addListener('item', ({ index }) => {
    progress = { index, positionMs: 0, durationMs: -1, at: Date.now() };
    syncFromIndex(index, 0);
  });
  void Native.addListener('state', ({ playing, buffering }) => set({ playing, buffering }));
  void Native.addListener('progress', (e) => {
    progress = e;
    syncFromIndex(e.index, e.positionMs);
  });
  void Native.addListener('ended', ({ reason }) => {
    if (reason === 'sleep') set({ playing: false, sleep: { kind: 'off' } });
    else set({ active: false, playing: false, surah: null, ayah: null, sleep: { kind: 'off' } });
  });
  void Native.addListener('error', () => set({ buffering: false }));
  // Events may be dropped while the app was in the background: catch up on return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.active || state.backend !== 'native') return;
    void Native.getState().then((s) => {
      if (s.count === 0) { set({ active: false, playing: false, surah: null, ayah: null }); return; }
      progress = { index: s.index, positionMs: s.positionMs, durationMs: -1, at: Date.now() };
      set({ playing: s.playing });
      syncFromIndex(s.index, s.positionMs);
    });
  });
}

function syncFromIndex(index: number, positionMs: number) {
  const item = queue[index];
  if (!item) return;
  const ayah = ayahAt(item, positionMs, audioIndex);
  if (state.surah !== item.surah || state.ayah !== ayah || state.rep !== item.rep) set({ surah: item.surah, ayah, rep: item.rep });
}

// ---------- web backend ----------

let webRun = 0; // bumping it aborts the running loop
let webPaused = false;
let sleepTimer: ReturnType<typeof setTimeout> | undefined;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runWeb(plan: PlaybackPlan, startIndex: number) {
  const run = ++webRun;
  audioController.setReciter(plan.reciter);
  audioController.setSpeed(plan.rate);
  audioController.setVolume(1);
  const times = Math.max(1, plan.repeatEach);
  let i = startIndex;
  while (run === webRun) {
    const { surah, ayah } = plan.ayahs[i];
    for (let r = 0; r < times && run === webRun; r++) {
      set({ surah, ayah, rep: r, playing: true });
      setMediaSession(plan, surah, ayah);
      await audioController.playAndWait(getAudioUrl(surah, ayah, plan.reciter));
      if (run !== webRun) return;
      // Sleep at the ayah's end: pause here, so play carries on from the next one
      if (state.sleep.kind === 'item') { webPaused = true; set({ playing: false, sleep: { kind: 'off' } }); }
      const last = !plan.loop && i === plan.ayahs.length - 1 && r === times - 1;
      if (!last) await wait(plan.pauseMs > 0 ? plan.pauseMs : r < times - 1 ? GAP_BETWEEN_REPEATS_MS : GAP_BETWEEN_AYAHS_MS);
      while (webPaused && run === webRun) await wait(200);
    }
    if (run !== webRun) return;
    if (i < plan.ayahs.length - 1) i++;
    else if (plan.loop) i = 0;
    else break;
  }
  if (run === webRun) set({ active: false, playing: false, surah: null, ayah: null });
}

function stopWeb() {
  webRun++;
  webPaused = false;
  audioController.stop();
}

function setMediaSession(plan: PlaybackPlan, surah: number, ayah: number) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${plan.surahName(surah)} · ${ayah}`,
      artist: RECITERS.find((r) => r.id === plan.reciter)?.name ?? '',
      album: 'Takrar',
      artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => resumeRecitation());
    navigator.mediaSession.setActionHandler('pause', () => pauseRecitation());
    navigator.mediaSession.setActionHandler('stop', () => stopRecitation());
  } catch { /* older browsers: no metadata */ }
}

// ---------- public API ----------

let currentPlan: PlaybackPlan | null = null;
export const currentPlaybackPlan = () => currentPlan;

/** Start playing `plan` from `startIndex` (an index into plan.ayahs) */
export async function startRecitation(plan: PlaybackPlan, startIndex = 0): Promise<void> {
  stopRecitation();
  currentPlan = plan;
  const backend = nativeRecitation() ? 'native' : 'web';
  const first = plan.ayahs[startIndex];
  set({ active: true, playing: false, buffering: true, backend, surah: first.surah, ayah: first.ayah, rep: 0, sleep: { kind: 'off' } });
  if (backend === 'web') { void runWeb(plan, startIndex); return; }

  wireNative();
  audioIndex = await loadAudioIndex(plan.reciter);
  const reciterName = RECITERS.find((r) => r.id === plan.reciter)?.name ?? '';
  queue = buildQueue(plan.ayahs.slice(startIndex).concat(plan.loop ? plan.ayahs.slice(0, startIndex) : []), {
    reciter: plan.reciter,
    reciterName,
    surahAudio: audioIndex,
    fallbackReciter: surahAudioFallback(plan.reciter),
    repeatEach: plan.repeatEach,
    merge: plan.repeatEach <= 1 && plan.pauseMs === 0,
    surahName: plan.surahName,
    localUrl: plan.localUrl,
  });
  nativeRate = plan.rate;
  progress = { index: 0, positionMs: 0, durationMs: -1, at: Date.now() };
  await Native.setQueue({
    items: queue.map((q) => ({ url: q.url, startMs: q.startMs, endMs: q.endMs, title: q.title, subtitle: q.subtitle, tag: q.tag })),
    startIndex: 0,
    pauseMs: plan.pauseMs,
    loop: plan.loop,
    rate: plan.rate,
  });
}

export function pauseRecitation() {
  if (!state.active) return;
  if (state.backend === 'native') void Native.pause();
  else { webPaused = true; audioController.pause(); set({ playing: false }); }
}

export function resumeRecitation() {
  if (!state.active) return;
  if (state.backend === 'native') void Native.play();
  else { webPaused = false; audioController.resume(); set({ playing: true }); }
}

export function stopRecitation() {
  clearTimeout(sleepTimer);
  if (state.backend === 'native' && state.active) void Native.stop();
  stopWeb();
  queue = [];
  currentPlan = null;
  set({ active: false, playing: false, buffering: false, surah: null, ayah: null, rep: 0, sleep: { kind: 'off' } });
}

export function setRecitationRate(rate: number) {
  nativeRate = rate;
  if (state.backend === 'native' && state.active) void Native.setRate({ rate });
  else audioController.setSpeed(rate);
}

/** minutes > 0: fade out after that long; 'item': at the end of the ayah playing; null: off */
export function setSleepTimer(minutes: number | 'item' | null) {
  clearTimeout(sleepTimer);
  const sleep: SleepMode = minutes === null ? { kind: 'off' } : minutes === 'item' ? { kind: 'item' } : { kind: 'timer', endsAt: Date.now() + minutes * 60_000 };
  set({ sleep });
  if (state.backend === 'native') {
    void Native.setSleepTimer({ minutes: minutes === null ? -1 : minutes === 'item' ? 0 : minutes, fadeMs: FADE_MS });
    return;
  }
  if (sleep.kind === 'timer') {
    sleepTimer = setTimeout(async () => {
      for (let v = 1; v >= 0; v -= 0.05) { audioController.setVolume(v); await wait(FADE_MS / 20); }
      pauseRecitation();
      audioController.setVolume(1);
      set({ sleep: { kind: 'off' } });
    }, minutes as number * 60_000);
  }
}

/** ms into the playing ayah's own recording (for word highlighting) */
export function recitationClockMs(): number {
  if (state.backend === 'web') return audioController.currentTime * 1000;
  const item = queue[progress.index];
  if (!item) return 0;
  const pos = progress.positionMs + (state.playing ? (Date.now() - progress.at) * nativeRate : 0);
  return msIntoAyah(item, pos, state.ayah ?? item.ayahFrom, audioIndex);
}

/** The playing ayah's length in ms, when known */
export function recitationAyahDurationMs(): number {
  if (state.backend === 'web') return audioController.duration * 1000;
  const item = queue[progress.index];
  if (!item) return 0;
  const ayah = state.ayah ?? item.ayahFrom;
  const span = audioIndex?.verses[item.surah - 1]?.[ayah - 1];
  if (span && item.endMs != null) return span[1] - span[0];
  return progress.durationMs > 0 ? progress.durationMs : 0;
}
