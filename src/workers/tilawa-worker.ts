/// <reference lib="webworker" />
// Tilawa recitation check — runs OFF the main thread.
// Bundled to public/workers/tilawa-worker.js by scripts/build-workers.mjs.
//
// The Zipformer model and phoneme corpus are Quran-Lab NPL-1.2 (see
// public/models/tilawa/NPL-1.2.txt when present): the feature they power must
// always be free — never behind a payment, subscription, trial or ads.
//
// Correction mode (@tilawa/core 0.4): told the passage on screen, the engine flags
// likely slips (a dropped or swapped word, a look-alike ayah's wording, a skipped
// ayah). Each flag pauses the engine until answered; we answer "review later" at
// once so recitation never stops, and pass the flag on for the summary.
//
// Tracking mode (`mode: 'tracking'` on init) just follows along and finds where you
// are anywhere in the Quran: recite-to-find search uses it.
//
//   IN:  { type: 'init', passage?, mode? } | { type: 'audio', pcm: Float32Array (16 kHz mono) }
//        | { type: 'stop' } | { type: 'reset', passage? }
//   OUT: { type: 'loading', progress } | { type: 'ready' } | { type: 'event', msg }
//        | { type: 'issue', issue } | { type: 'stopped' } | { type: 'error', message }

import * as ort from 'onnxruntime-web/wasm';
import { createRecognitionSession } from '@tilawa/core';

const BASE = '/models/tilawa/';
const MODEL = `${BASE}zipformer_a0w_ep1_a05.int8.onnx`;
const CORPUS = `${BASE}zipformer_quran.json`;

ort.env.wasm.wasmPaths = '/ort/';
// Threaded WASM init hangs without cross-origin isolation (COOP/COEP)
ort.env.wasm.numThreads = 1;

type Session = Awaited<ReturnType<typeof createRecognitionSession>>;
type Passage = { surah: number; ayah: number; ayahEnd?: number } | null;
let session: Session | null = null;
// feed/stop must never interleave: every operation waits for the previous one
let queue: Promise<unknown> = Promise.resolve();
// A flag raised during the last call, waiting for our "review later"
let flagged = false;
const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't load ${url} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) post({ type: 'loading', progress: Math.round((got / total) * 90) });
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

function onEvent(msg: unknown) {
  const m = msg as { type: string; state?: { phase: string; issue: unknown } };
  if (m.type === 'correction') {
    if (m.state?.phase === 'error' && m.state.issue) {
      flagged = true;
      post({ type: 'issue', issue: m.state.issue });
    }
    return;
  }
  if (m.type === 'correction_note') return; // soft notes (a repeated word) aren't mistakes
  post({ type: 'event', msg });
}

/** Defer every raised flag so the engine keeps listening (one flag per answer) */
function deferFlags() {
  const z = session?.zipformer;
  for (let guard = 0; flagged && z && guard < 50; guard++) {
    flagged = false;
    z.correct('review_later');
  }
  flagged = false;
}

function setPassage(passage: Passage) {
  session?.zipformer?.setExpected(passage);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      if (m.type === 'init') {
        if (!session) {
          post({ type: 'loading', progress: 0 });
          session = await createRecognitionSession({
            ort,
            model: () => fetchWithProgress(MODEL),
            corpus: () => fetch(CORPUS).then((r) => r.json()),
            onEvent,
          });
          session.zipformer?.setMode(m.mode === 'tracking' ? 'tracking' : 'correction');
        }
        if (m.passage !== undefined) setPassage(m.passage);
        post({ type: 'ready' });
      } else if (m.type === 'audio' && session) {
        await session.feed(m.pcm);
        deferFlags();
      } else if (m.type === 'stop' && session) {
        await session.stop();
        // The look-alike and ayah-order rules run over the whole take here
        deferFlags();
        post({ type: 'stopped' });
      } else if (m.type === 'reset' && session) {
        flagged = false;
        session.reset();
        if (m.passage !== undefined) setPassage(m.passage);
      }
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });
};
