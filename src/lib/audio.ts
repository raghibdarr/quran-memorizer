import { getCachedAudio, cacheAudio } from './storage';

type AudioState = 'idle' | 'playing' | 'paused' | 'loading';

export interface ReciterOption {
  id: string;          // everyayah directory id
  name: string;        // display name
  hint?: string;       // optional one-line hint
}

/** Reciters available on everyayah.com. Single source of truth — used by both the AudioController and the settings UI. */
export const RECITERS: ReciterOption[] = [
  { id: 'Alafasy_128kbps', name: 'Mishary Alafasy', hint: 'Default — clear, modern' },
  { id: 'Husary_128kbps', name: 'Mahmoud Al-Hussary', hint: 'Slower, beginner-friendly' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdul Basit (Murattal)', hint: 'Slow, ornate' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Al-Minshawy (Murattal)', hint: 'Classical' },
  { id: 'Nasser_Alqatami_128kbps', name: 'Nasser Al-Qatami' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'Yasser Ad-Dussary' },
  { id: 'Hudhaify_128kbps', name: 'Ali Al-Hudhaify' },
  { id: 'Maher_AlMuaiqly_64kbps', name: 'Maher Al-Muaiqly' },
  { id: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', name: 'Ahmed Al-Ajamy' },
  { id: 'Muhammad_Jibreel_128kbps', name: 'Muhammad Jibreel' },
];

const EVERYAYAH_HOST_PREFIX = 'everyayah.com/data/';

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

  setReciter(reciterId: string): void {
    this._reciter = reciterId;
  }

  private resolveUrl(url: string): string {
    return transformReciterUrl(url, this._reciter);
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('play', () => { this._state = 'playing'; this.notify(); });
      this.audio.addEventListener('pause', () => {
        if (!this.audio?.ended) this._state = 'paused';
        this.notify();
      });
      this.audio.addEventListener('ended', () => {
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

  get currentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get activeUrl(): string | null {
    return this.currentUrl;
  }

  get speed(): number {
    return this._speed;
  }

  async play(url: string): Promise<void> {
    const audio = this.getAudio();
    const resolved = this.resolveUrl(url);

    // If same (caller) URL is already playing, ignore (prevent duplicates)
    if (this.currentUrl === url && this.isPlaying) return;

    // If same URL is paused, just resume
    if (this.currentUrl === url && this.isPaused) {
      await audio.play();
      return;
    }

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
    await audio.play();

    // Cache in background (don't await)
    fetch(resolved)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (blob) cacheAudio(resolved, blob); })
      .catch(() => {});
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
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
    this.currentUrl = null;
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
    const clamped = Math.max(0, Math.min(time, this.audio.duration || 0));
    this.audio.currentTime = clamped;
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
