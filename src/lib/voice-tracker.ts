'use client';

// Voice check (Tilawa trial, 2026-09-28): microphone → 16 kHz mono PCM → the
// recognition worker (src/workers/tilawa-worker.ts). The model runs on the device;
// no audio leaves it. Assets exist only where CI staged them (the Android app), so
// `voiceCheckAvailable()` gates the feature everywhere else.

const TARGET_RATE = 16000;
// The licence ships beside the model; a missing file may come back as the app's HTML shell
const PROBE = '/models/tilawa/NPL-1.2.txt';

let availability: Promise<boolean> | null = null;
/** True when the on-device model is present (the Android trial build) */
export function voiceCheckAvailable(): Promise<boolean> {
  availability ??= fetch(PROBE)
    .then(async (r) => r.ok && (await r.text()).startsWith('Quran-Lab No-Profit License'))
    .catch(() => false);
  return availability;
}

/** Linear resample to 16 kHz (for devices that won't open a 16 kHz AudioContext) */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_RATE) return input.slice();
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const t = x - j;
    out[i] = input[j] * (1 - t) + (input[Math.min(j + 1, input.length - 1)] ?? 0) * t;
  }
  return out;
}

/** Map an engine word index to ours (4 of 6,236 ayahs split one word differently) */
export function mapWordIndex(engineIndex: number, engineTotal: number, ourTotal: number): number {
  if (engineTotal === ourTotal || engineTotal <= 0) return Math.min(engineIndex, ourTotal - 1);
  return Math.min(ourTotal - 1, Math.round((engineIndex * ourTotal) / engineTotal));
}

export type TrackerEvent =
  | { type: 'word_progress'; surah: number; ayah: number; total_words: number; matched_indices: number[] }
  | { type: 'verse_match'; surah: number; ayah: number }
  | { type: string; [k: string]: unknown };

export interface VoiceTrackerHandlers {
  onLoading?: (progress: number) => void;
  onReady?: () => void;
  onEvent: (e: TrackerEvent) => void;
  onStopped?: () => void;
  onError?: (message: string) => void;
}

export class VoiceTracker {
  private worker: Worker;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;

  constructor(private h: VoiceTrackerHandlers) {
    this.worker = new Worker('/workers/tilawa-worker.js', { type: 'module' });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'loading') h.onLoading?.(m.progress);
      else if (m.type === 'ready') h.onReady?.();
      else if (m.type === 'event') h.onEvent(m.msg);
      else if (m.type === 'stopped') h.onStopped?.();
      else if (m.type === 'error') h.onError?.(m.message);
    };
    this.worker.postMessage({ type: 'init' });
  }

  /** Open the microphone and stream audio to the engine (call from a user gesture) */
  async start() {
    this.worker.postMessage({ type: 'reset' });
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Raw mic: in testing, the browser's noise suppression and auto-gain clipped long
      // vowels and dropped short words (Al-Ikhlas matched 1 of 3 ayahs with them on, 3 of 3 off)
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    try {
      this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      this.ctx = new AudioContext(); // resampled per chunk below
    }
    const source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but runs everywhere without a separate worklet file;
    // 4096 frames ≈ 256 ms at 16 kHz — the engine's natural chunk size
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    const rate = this.ctx.sampleRate;
    this.node.onaudioprocess = (e) => {
      const pcm = resampleTo16k(e.inputBuffer.getChannelData(0), rate);
      this.worker.postMessage({ type: 'audio', pcm }, [pcm.buffer]);
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination); // silent output; keeps the node pulling audio
  }

  /** Close the microphone and let the engine finish the last words */
  async stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.worker.postMessage({ type: 'stop' });
  }

  dispose() {
    void this.stop();
    this.worker.terminate();
  }
}
