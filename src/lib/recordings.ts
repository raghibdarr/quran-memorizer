'use client';

// Your own recitations (roadmap #12): record an attempt, listen back later. Kept in
// this device's IndexedDB only — never uploaded, never synced (privacy page says so).

import { createStore, del, get, keys, set } from 'idb-keyval';

const store = createStore('takrar-recordings', 'recordings');
/** Recordings kept per surah or page; the oldest go first */
const PER_SCOPE = 10;

export interface Recording {
  id: string;
  /** What it's of: "surah:112" or "page:604" */
  scope: string;
  label: string;
  at: number;
  durationMs: number;
  type: string;
  blob: Blob;
}

const listeners = new Set<() => void>();
export function subscribeRecordings(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const changed = () => listeners.forEach((l) => l());

export async function listRecordings(scope: string): Promise<Recording[]> {
  const all = (await keys(store)) as string[];
  const mine = all.filter((k) => k.startsWith(`${scope}|`));
  const recs = (await Promise.all(mine.map((k) => get<Recording>(k, store)))).filter((r): r is Recording => !!r);
  return recs.sort((a, b) => b.at - a.at);
}

export async function saveRecording(r: Omit<Recording, 'id'>): Promise<Recording> {
  const id = `${r.scope}|${r.at}`;
  const rec = { ...r, id };
  await set(id, rec, store);
  const list = await listRecordings(r.scope);
  await Promise.all(list.slice(PER_SCOPE).map((old) => del(old.id, store)));
  changed();
  return rec;
}

export async function deleteRecording(id: string): Promise<void> {
  await del(id, store);
  changed();
}

/** A MediaRecorder type this browser can make (Chrome/Android: webm; Safari/iOS: mp4) */
export function recordingType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && recordingType() !== '';
