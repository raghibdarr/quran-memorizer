import { getCachedAudio, cacheAudio } from './storage';
import { isSurahAudio, surahAudioFallback } from './reciters';
import { loadSurahAudio } from './segment-audio';

type AudioState = 'idle' | 'playing' | 'paused' | 'loading';

export { RECITERS, type ReciterOption } from './reciters';

const EVERYAYAH_HOST_PREFIX = 'everyayah.com/data/';
/** Callers always address an ayah by its everyayah URL: …/data/<reciter>/SSSAAA.mp3 */
const AYAH_FILE = /everyayah\.com\/data\/[^/]+\/(\d{3})(\d{3})\.mp3$/;

/**
 * Swap the reciter segment in an everyayah URL. Non-everyayah URLs pass through.
 * Returns the original URL if it doesn't match the expected pattern.
 */
export function transformReciterUrl(url: string, reciterId: string): string {
  const idx = url.indexOf(EVERYAYAH_HOST_PREFIX);
  if (idx === -1) return url;
  const after = url.slice(idx + EVERYAYAH_HOST_PREFIX.length);
  const slashIdx = after.indexOf('/');
  if (slashIdx === -1) return url;
  return url.slice(0, idx + EVERYAYAH_HOST_PREFIX.length) + reciterId + after.slice(slashIdx);
}

class AudioController {
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private listeners: Set<() => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private _state: AudioState = 'idle';
  private _speed: number = 1;
  private _reciter: string = 'Alafasy_128kbps';
  /** Tears down the active range guard (timeupdate listener + poll) */
  private rangeCleanup: (() => void) | null = null;
  /** Where the ayah's clock starts inside the loaded file: non-zero only for surah audio */
  private baseSec = 0;
  /** The ayah's length when it's a slice of a surah file; null = the file's own duration */
  private spanSec: number | null = null;
  /** A range just ended: the pause it issues is an end, not a user pause */
  private endingRange = false;

  setReciter(reciterId: string): void {
    this._reciter = reciterId;
  }

  private resolveUrl(url: string): string {
    // A surah-audio reciter's missing ayahs come from a per-ayah collection (the same voice where one exists)
    return transformReciterUrl(url, isSurahAudio(this._reciter) ? surahAudioFallback(this._reciter) : this._reciter);
  }

  /** For surah-audio reciters: the surah file and the ayah's [startMs, endMs] inside it */
  private async locate(url: string): Promise<{ src: string; startMs: number; endMs: number } | null> {
    if (!isSurahAudio(this._reciter)) return null;
    const m = AYAH_FILE.exec(url);
    if (!m) return null;
    const map = await loadSurahAudio(this._reciter, Number(m[1]));
    const v = map?.verses[String(Number(m[2]))];
    return map && v ? { src: map.src, startMs: v[0], endMs: v[1] } : null;
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('play', () => { this._state = 'playing'; this.notify(); });
      this.audio.addEventListener('pause', () => {
        if (this.endingRange) { this.endingRange = false; return; }
        if (!this.audio?.ended) this._state = 'paused';
        this.notify();
      });
      this.audio.addEventListener('ended', () => {
        this.rangeCleanup?.();
        this._state = 'idle';
        this.notify();
        this.endedCallbacks.forEach((cb) => cb());
        this.endedCallbacks.clear();
      });
      this.audio.addEventListener('timeupdate', () => this.notify());
      this.audio.addEventListener('error', () => {
        this._state = 'idle';
        this.notify();
        this.endedCallbacks.forEach((cb) => cb());
        this.endedCallbacks.clear();
      });
    }
    return this.audio;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  get state(): AudioState {
    return this._state;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  get isPaused(): boolean {
    return this._state === 'paused';
  }

  get isLoading(): boolean {
    return this._state === 'loading';
  }

  /** Seconds into the current ayah (for surah audio, from the ayah's start, not the file's) */
  get currentTime(): number {
    return Math.max(0, (this.audio?.currentTime ?? 0) - this.baseSec);
  }

  /** The current ayah's length in seconds */
  get duration(): number {
    return this.spanSec ?? this.audio?.duration ?? 0;
  }

  get activeUrl(): string | null {
    return this.currentUrl;
  }

  get speed(): number {
    return this._speed;
  }

  async play(url: string): Promise<void> {
    const audio = this.getAudio();

    // If same (caller) URL is already playing, ignore (prevent duplicates)
    if (this.currentUrl === url && this.isPlaying) return;

    // If same URL is paused, just resume
    if (this.currentUrl === url && this.isPaused) {
      await audio.play();
      return;
    }

    const span = await this.locate(url);
    if (span) return this.playSpan(url, span.src, span.startMs, span.endMs, [span.startMs, span.endMs]);

    const resolved = this.resolveUrl(url);

    // Stop current playback before starting new
    this.stop();
    this.currentUrl = url; // Track caller URL so togglePlayPause/activeUrl still match
    this._state = 'loading';
    this.notify();

    // Apply stored speed before playing
    audio.playbackRate = this._speed;

    // Try IndexedDB cache first — keyed by resolved URL so per-reciter cache is separate
    try {
      const cached = await getCachedAudio(resolved);
      if (cached) {
        const objectUrl = URL.createObjectURL(cached);
        audio.src = objectUrl;
        audio.playbackRate = this._speed;
        await audio.play();
        return;
      }
    } catch {
      // Fall through to direct play
    }

    audio.src = resolved;
    audio.playbackRate = this._speed;
    try {
      await audio.play();
    } catch {
      // Source failed to load (e.g. a missing word-audio file 404s → NotSupportedError)
      // or playback was interrupted. The 'error' listener already resets state; swallow
      // here so it never surfaces as an unhandled runtime rejection to the caller.
      this._state = 'idle';
      this.notify();
      return;
    }

    // Cache in background (don't await)
    fetch(resolved)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (blob) cacheAudio(resolved, blob); })
      .catch(() => {});
  }

  /** Seeking needs metadata (duration/seekability) first */
  private waitForMetadata(audio: HTMLAudioElement): Promise<void> {
    return new Promise<void>((resolve) => {
      if (audio.readyState >= 1) return resolve();
      const done = () => {
        audio.removeEventListener('loadedmetadata', done);
        audio.removeEventListener('error', done);
        resolve();
      };
      audio.addEventListener('loadedmetadata', done);
      audio.addEventListener('error', done);
    });
  }

  /** Stop at endSec. timeupdate ticks only ~4x/sec, too coarse for a word boundary, so poll while playing. */
  private guardEnd(audio: HTMLAudioElement, endSec: number): void {
    const finish = () => {
      this.rangeCleanup?.();
      if (!audio.paused) { this.endingRange = true; audio.pause(); }
      this._state = 'idle';
      this.notify();
      this.endedCallbacks.forEach((cb) => cb());
      this.endedCallbacks.clear();
    };
    const check = () => {
      if (audio.currentTime >= endSec - 0.04) finish();
    };
    const poll = setInterval(() => { if (!audio.paused) check(); }, 30);
    audio.addEventListener('timeupdate', check);
    this.rangeCleanup = () => {
      audio.removeEventListener('timeupdate', check);
      clearInterval(poll);
      this.rangeCleanup = null;
    };
  }

  /**
   * Play [fromMs, toMs] of a whole-surah file as if it were the ayah's own recording:
   * the clock (currentTime, duration, seek) runs from the ayah's start. The file stays
   * loaded between calls, so repeating an ayah or moving to the next is a seek, not a
   * reload. Surah files are never cached for offline: they run to 100+ MB.
   */
  private async playSpan(url: string, src: string, fromMs: number, toMs: number, verse: [number, number]): Promise<void> {
    const audio = this.getAudio();
    this.rangeCleanup?.();
    if (!audio.paused) { this.endingRange = true; audio.pause(); }
    this.currentUrl = url;
    this._state = 'loading';
    this.baseSec = verse[0] / 1000;
    this.spanSec = (verse[1] - verse[0]) / 1000;
    this.notify();

    if (audio.src !== src) {
      audio.src = src;
      await this.waitForMetadata(audio);
    }
    audio.playbackRate = this._speed;
    try {
      audio.currentTime = fromMs / 1000;
    } catch {
      // unseekable: nothing sensible to play
    }
    this.guardEnd(audio, toMs / 1000);
    try {
      await audio.play();
    } catch {
      this.rangeCleanup?.();
      this._state = 'idle';
      this.notify();
      this.endedCallbacks.forEach((cb) => cb());
      this.endedCallbacks.clear();
    }
  }

  /**
   * Play only [startMs, endMs] of an ayah (ms from the ayah's start) — segment audio
   * sliced out of the recording via word timestamps (see src/lib/segment-audio.ts).
   * Resolves once playback starts; waitForEnd()/playRangeAndWait() resolve when the
   * range finishes, so the drill helpers (playSequence/playRepeated) compose with ranges.
   */
  async playRange(url: string, startMs: number, endMs: number): Promise<void> {
    const span = await this.locate(url);
    if (span) {
      return this.playSpan(url, span.src, span.startMs + startMs, Math.min(span.endMs, span.startMs + endMs), [span.startMs, span.endMs]);
    }

    const audio = this.getAudio();
    const resolved = this.resolveUrl(url);

    this.stop();
    this.currentUrl = url;
    this._state = 'loading';
    this.notify();
    audio.playbackRate = this._speed;

    // Same cache-first source selection as play()
    let src = resolved;
    let fromCache = false;
    try {
      const cached = await getCachedAudio(resolved);
      if (cached) {
        src = URL.createObjectURL(cached);
        fromCache = true;
      }
    } catch {
      // fall through to network
    }
    audio.src = src;
    audio.playbackRate = this._speed;

    await this.waitForMetadata(audio);
    try {
      audio.currentTime = Math.max(0, startMs / 1000);
    } catch {
      // unseekable — play from the top rather than not at all
    }
    this.guardEnd(audio, endMs / 1000);

    try {
      await audio.play();
    } catch {
      this.rangeCleanup?.();
      this._state = 'idle';
      this.notify();
      this.endedCallbacks.forEach((cb) => cb());
      this.endedCallbacks.clear();
      return;
    }

    if (!fromCache) {
      fetch(resolved)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => { if (blob) cacheAudio(resolved, blob); })
        .catch(() => {});
    }
  }

  /** Play a range and wait for it to finish */
  async playRangeAndWait(url: string, startMs: number, endMs: number): Promise<void> {
    await this.playRange(url, startMs, endMs);
    await this.waitForEnd();
  }

  pause(): void {
    if (this.audio && this.isPlaying) {
      this.audio.pause();
    }
  }

  resume(): void {
    if (this.audio && this.isPaused) {
      this.audio.play();
    }
  }

  togglePlayPause(url: string): void {
    if (this.currentUrl === url && this.isPlaying) {
      this.pause();
    } else if (this.currentUrl === url && this.isPaused) {
      this.resume();
    } else {
      this.play(url);
    }
  }

  stop(): void {
    this.rangeCleanup?.();
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
    this.currentUrl = null;
    this.baseSec = 0;
    this.spanSec = null;
    this._state = 'idle';
    this.notify();
  }

  setSpeed(rate: number): void {
    this._speed = rate;
    const audio = this.getAudio();
    audio.playbackRate = rate;
  }

  /** Seek the currently loaded audio to `time` seconds. No-op if nothing is loaded. */
  seek(time: number): void {
    if (!this.audio || !this.currentUrl) return;
    const clamped = Math.max(0, Math.min(time, this.duration || 0));
    this.audio.currentTime = this.baseSec + clamped;
    this.notify();
  }

  /** Returns a promise that resolves when current audio ends */
  waitForEnd(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this._state === 'idle') {
        resolve();
        return;
      }
      this.endedCallbacks.add(resolve);
    });
  }

  /** Play a URL and wait for it to finish */
  async playAndWait(url: string): Promise<void> {
    await this.play(url);
    await this.waitForEnd();
  }

  /** Play a sequence of URLs with optional gap between them */
  async playSequence(urls: string[], gapMs = 400): Promise<void> {
    for (const url of urls) {
      await this.playAndWait(url);
      if (gapMs > 0) {
        await new Promise<void>((r) => setTimeout(r, gapMs));
      }
    }
  }

  /** Play a URL N times with gap between repetitions */
  async playRepeated(url: string, times: number, gapMs = 600): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.playAndWait(url);
      if (i < times - 1 && gapMs > 0) {
        await new Promise<void>((r) => setTimeout(r, gapMs));
      }
    }
  }
}

export const audioController = new AudioController();
