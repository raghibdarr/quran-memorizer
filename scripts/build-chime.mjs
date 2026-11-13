// Synthesises Takrar's prayer-alert chime (all-in-one spec 6: the `prayer-chime-v1` channel
// plays sound `takrar_chime`). Our own work: two soft bell tones built from sine waves, no
// recording and no sample library. Deterministic: the same script always writes the same file.
//
//   node scripts/build-chime.mjs           writes android/app/src/main/res/raw/takrar_chime.wav
//   node scripts/build-chime.mjs --check   compares the committed file without writing
//
// Provenance: data-sources/chime/SOURCE.md. Licence notice: data-sources/licenses.d/25-chime.txt.
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHIME_PATH = join(root, 'android', 'app', 'src', 'main', 'res', 'raw', 'takrar_chime.wav');

export const SAMPLE_RATE = 44100;
export const DURATION_S = 2;

/** Two notes, a falling major third (E5 then C5): calm, short, not an alarm */
const NOTES = [
  { start: 0, freq: 659.26 },
  { start: 0.42, freq: 523.25 },
];
/** Sine partials of each note, relative to the fundamental: a little warmth, no harshness */
const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.28 },
  { ratio: 3, gain: 0.07 },
];
const ATTACK_S = 0.012;
const DECAY_TAU_S = 0.45;
const TAIL_FADE_S = 0.2;
const PEAK = 0.6;

/** The chime as 16-bit mono samples */
export function synthChime() {
  const n = Math.round(SAMPLE_RATE * DURATION_S);
  const buf = new Float64Array(n);
  for (const note of NOTES) {
    const first = Math.round(note.start * SAMPLE_RATE);
    for (let i = first; i < n; i++) {
      const t = (i - first) / SAMPLE_RATE;
      // Raised-cosine attack (no click), then an exponential ring-out like a struck bell
      const attack = t < ATTACK_S ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ATTACK_S) : 1;
      let s = 0;
      for (const p of PARTIALS) {
        // Higher partials die away faster, so the tone softens as it rings
        s += p.gain * Math.exp((-t * p.ratio) / DECAY_TAU_S) * Math.sin(2 * Math.PI * note.freq * p.ratio * t);
      }
      buf[i] += attack * s;
    }
  }
  // Fade the last moments to true silence so the sound ends cleanly
  const fade = Math.round(TAIL_FADE_S * SAMPLE_RATE);
  for (let k = 0; k < fade; k++) buf[n - fade + k] *= 0.5 + 0.5 * Math.cos((Math.PI * (k + 1)) / fade);
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(-32767, Math.min(32767, Math.round((buf[i] / max) * PEAK * 32767)));
  return out;
}

/** A canonical 44-byte-header PCM WAV */
export function encodeWav(samples, rate = SAMPLE_RATE) {
  const data = samples.length * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16); // fmt chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); // byte rate
  b.writeUInt16LE(2, 32); // block align
  b.writeUInt16LE(16, 34); // bits per sample
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(data, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + i * 2);
  return b;
}

export const buildChimeWav = () => encodeWav(synthChime());

/**
 * True when `file` holds the chime this script makes. Allows one step of rounding difference
 * per sample, in case a different JavaScript engine computes sin/exp a hair differently.
 */
export function matchesChime(file) {
  const want = buildChimeWav();
  if (!file || file.length !== want.length || !file.subarray(0, 44).equals(want.subarray(0, 44))) return false;
  for (let i = 44; i < want.length; i += 2) {
    if (Math.abs(file.readInt16LE(i) - want.readInt16LE(i)) > 1) return false;
  }
  return true;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function main() {
  const check = process.argv.includes('--check');
  const wav = buildChimeWav();
  if (check) {
    const ok = existsSync(CHIME_PATH) && matchesChime(readFileSync(CHIME_PATH));
    console.log(ok ? 'takrar_chime.wav is up to date' : 'takrar_chime.wav differs: run node scripts/build-chime.mjs');
    process.exit(ok ? 0 : 1);
  }
  mkdirSync(dirname(CHIME_PATH), { recursive: true });
  writeFileSync(CHIME_PATH, wav);
  console.log(`wrote ${CHIME_PATH} (${wav.length} bytes, sha256 ${sha256(wav)})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
