import { getCachedAudio, cacheAudio } from './storage';

class AudioController {
  private audio: HTMLAudioElement | null = null;
  private listeners: Set<() => void> = new Set();

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('play', () => this.notify());
      this.audio.addEventListener('pause', () => this.notify());
      this.audio.addEventListener('ended', () => this.notify());
      this.audio.addEventListener('timeupdate', () => this.notify());
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

  get isPlaying(): boolean {
    return this.audio ? !this.audio.paused && !this.audio.ended : false;
  }

  get currentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  async play(url: string): Promise<void> {
    const audio = this.getAudio();

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

    // Cache in background
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        await cacheAudio(url, blob);
      }
    } catch {
      // Non-critical
    }
  }

  pause(): void {
    this.audio?.pause();
  }

  resume(): void {
    this.audio?.play();
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  setSpeed(rate: number): void {
    const audio = this.getAudio();
    audio.playbackRate = rate;
  }

  onEnded(callback: () => void): () => void {
    const audio = this.getAudio();
    audio.addEventListener('ended', callback);
    return () => audio.removeEventListener('ended', callback);
  }

  async playSequence(urls: string[], gapMs = 500): Promise<void> {
    for (const url of urls) {
      await this.play(url);
      await new Promise<void>((resolve) => {
        const cleanup = this.onEnded(() => {
          cleanup();
          setTimeout(resolve, gapMs);
        });
      });
    }
  }
}

export const audioController = new AudioController();
