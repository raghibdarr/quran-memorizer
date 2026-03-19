/**
 * Web Worker for running Whisper speech-to-text transcription.
 * Uses raghibdarr/whisper-tiny-ar-quran-onnx — Quran-specific Whisper model
 * (tarteel-ai/whisper-tiny-ar-quran converted to quantized ONNX).
 *
 * Loads Transformers.js from CDN to avoid Next.js bundler tree-shaking
 * out Whisper model support.
 *
 * Messages:
 *   IN:  { type: 'load' }  — load the model
 *   IN:  { type: 'transcribe', audio: Float32Array }  — transcribe audio
 *   OUT: { type: 'loading', progress: number }  — model download progress (0-100)
 *   OUT: { type: 'ready' }  — model loaded and ready
 *   OUT: { type: 'result', text: string }  — transcription result
 *   OUT: { type: 'error', message: string }  — error
 */

/// <reference lib="webworker" />

let pipelineFn: any = null;

async function loadModel() {
  try {
    // Import from CDN to bypass Next.js bundler which tree-shakes out Whisper support
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
    const { pipeline, env } = await import(/* webpackIgnore: true */ cdnUrl);

    env.backends.onnx.wasm.numThreads = 1;

    postMessage({ type: 'loading', progress: 10 });

    pipelineFn = await pipeline(
      'automatic-speech-recognition',
      'raghibdarr/whisper-base-ar-quran-onnx',
      {
        progress_callback: (progress: any) => {
          if (progress.status === 'progress' && progress.progress) {
            postMessage({ type: 'loading', progress: Math.round(progress.progress) });
          }
        },
      }
    );

    postMessage({ type: 'ready' });
  } catch (err) {
    postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to load Whisper model',
    });
  }
}

async function transcribe(audio: Float32Array) {
  if (!pipelineFn) {
    postMessage({ type: 'error', message: 'Model not loaded' });
    return;
  }

  try {
    const result = await pipelineFn(audio, {
      return_timestamps: false,
    });

    const text = typeof result === 'string' ? result : result?.text ?? '';
    postMessage({ type: 'result', text });
  } catch (err) {
    postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Transcription failed',
    });
  }
}

self.onmessage = (event: MessageEvent) => {
  const { type, audio } = event.data;
  if (type === 'load') {
    loadModel();
  } else if (type === 'transcribe') {
    transcribe(audio);
  }
};
