'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseWhisperReturn {
  transcribe: (audio: Float32Array, prompt?: string) => Promise<string>;
  isLoading: boolean;
  modelReady: boolean;
  downloadProgress: number;
  error: string | null;
  loadModel: () => void;
}

/**
 * Hook that manages the Whisper Web Worker lifecycle.
 * Call loadModel() to start downloading, then transcribe() when ready.
 */
export function useWhisper(): UseWhisperReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleMessage = useCallback((e: MessageEvent) => {
    const { type, progress, text, message } = e.data;
    switch (type) {
      case 'loading':
        setDownloadProgress(progress);
        break;
      case 'ready':
        setIsLoading(false);
        setModelReady(true);
        break;
      case 'result':
        resolveRef.current?.(text);
        resolveRef.current = null;
        rejectRef.current = null;
        break;
      case 'error':
        setError(message);
        setIsLoading(false);
        rejectRef.current?.(new Error(message));
        resolveRef.current = null;
        rejectRef.current = null;
        break;
    }
  }, []);

  const loadModel = useCallback(() => {
    if (workerRef.current || modelReady) return;
    setIsLoading(true);
    setError(null);

    // Plain-JS worker in /public — the bundler shipped the old TypeScript worker
    // through uncompiled, so voice recognition could never load in production
    const worker = new Worker('/workers/whisper-worker.js', { type: 'module' });
    worker.onmessage = handleMessage;
    worker.postMessage({ type: 'load' });
    workerRef.current = worker;
  }, [modelReady, handleMessage]);

  const transcribe = useCallback(async (audio: Float32Array, prompt?: string): Promise<string> => {
    if (!workerRef.current || !modelReady) {
      throw new Error('Model not ready');
    }
    return new Promise<string>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      workerRef.current!.postMessage({ type: 'transcribe', audio, prompt });
    });
  }, [modelReady]);

  return { transcribe, isLoading, modelReady, downloadProgress, error, loadModel };
}
