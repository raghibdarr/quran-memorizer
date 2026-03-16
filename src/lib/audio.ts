import { getCachedAudio, cacheAudio } from './storage';

type AudioState = 'idle' | 'playing' | 'paused' | 'loading';

class AudioController {
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private listeners: Set<() => void> = new Set();
  private endedCallbacks: Set<() => void> = new Set();
  private _state: AudioState = 'idle';

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

  async play(url: string): Promise<void> {
    const audio = this.getAudio();

    // If same URL is already playing, ignore (prevent duplicates)
    if (this.currentUrl === url && this.isPlaying) return;

    // If same URL is paused, just resume
    if (this.currentUrl === url && this.isPaused) {
      await audio.play();
      return;
    }

    // Stop current playback before starting new
    this.stop();
    this.currentUrl = url;
    this._state = 'loading';
    this.notify();

    // Try IndexedDB cache first
    try {
      const cached = await getCachedAudio(url);
      if (cached) {
        const objectUrl = URL.createObjectURL(cached);
        audio.src = objectUrl;
        await audio.play();
        return;
      }
    } catch {
      // Fall through to direct play
    }

    audio.src = url;
    await audio.play();

    // Cache in background (don't await)
    fetch(url)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (blob) cacheAudio(url, blob); })
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
    const audio = this.getAudio();
    audio.playbackRate = rate;
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
