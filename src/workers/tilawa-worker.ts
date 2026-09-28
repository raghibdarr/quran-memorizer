/// <reference lib="webworker" />
// Tilawa recitation tracking (trial, 2026-09-28) — runs OFF the main thread.
// Bundled to public/workers/tilawa-worker.js by scripts/build-workers.mjs.
//
// The Zipformer model and phoneme corpus are Quran-Lab NPL-1.2 (see
// public/models/tilawa/NPL-1.2.txt when present): the feature they power must
// always be free — never behind a payment, subscription, trial or ads.
//
//   IN:  { type: 'init' } | { type: 'audio', pcm: Float32Array (16 kHz mono) } | { type: 'stop' } | { type: 'reset' }
//   OUT: { type: 'loading', progress } | { type: 'ready' } | { type: 'event', msg } | { type: 'stopped' } | { type: 'error', message }

import * as ort from 'onnxruntime-web/wasm';
import { createRecognitionSession } from '@tilawa/core';

const BASE = '/models/tilawa/';
const MODEL = `${BASE}zipformer_interp_gentle_a05.int8.onnx`;
const CORPUS = `${BASE}zipformer_quran.json`;

ort.env.wasm.wasmPaths = '/ort/';
// Threaded WASM init hangs without cross-origin isolation (COOP/COEP)
ort.env.wasm.numThreads = 1;

type Session = Awaited<ReturnType<typeof createRecognitionSession>>;
let session: Session | null = null;
// feed/stop must never interleave: every operation waits for the previous one
let queue: Promise<unknown> = Promise.resolve();
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

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      if (m.type === 'init') {
        if (session) { post({ type: 'ready' }); return; }
        post({ type: 'loading', progress: 0 });
        session = await createRecognitionSession({
          ort,
          model: () => fetchWithProgress(MODEL),
          corpus: () => fetch(CORPUS).then((r) => r.json()),
          onEvent: (msg: unknown) => post({ type: 'event', msg }),
        });
        post({ type: 'ready' });
      } else if (m.type === 'audio' && session) {
        await session.feed(m.pcm);
      } else if (m.type === 'stop' && session) {
        await session.stop();
        post({ type: 'stopped' });
      } else if (m.type === 'reset' && session) {
        session.reset();
      }
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });
};
