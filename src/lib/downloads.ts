'use client';

// Offline recitations (roadmap #02): download a reciter's surahs to this device.
//
//   apps — files land in the app's own storage (Filesystem + FileTransfer) and the
//          native player is handed their file:// URLs (recitation-queue localUrl)
//   web  — responses go into the Cache API; the service worker answers audio
//          requests from it, byte ranges included, so playback works offline
//
// Audio is downloaded on the device for the person's own listening only and is
// never re-hosted (the hosts' terms; see the roadmap's licensing notes).
// What's downloaded is recorded per device in localStorage — it isn't synced.

import { Capacitor } from '@capacitor/core';
import { getAudioUrl } from './quran-data';
import { isSurahAudio, surahAudioFallback } from './reciters';
import { loadAudioIndex } from './audio-index';

export const AUDIO_CACHE = 'takrar-audio-v1';
const MANIFEST_KEY = 'audio-downloads';
const CONCURRENCY = 4;

export interface SurahDownload { bytes: number; files: number; at: number }
type Manifest = Record<string, Record<string, SurahDownload>>;

const native = () => Capacitor.isNativePlatform();

// ---------- manifest ----------

function readManifest(): Manifest {
  try { return JSON.parse(localStorage.getItem(MANIFEST_KEY) ?? '{}') as Manifest; } catch { return {}; }
}
function writeManifest(m: Manifest) {
  try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(m)); } catch { /* storage full: the files still play */ }
  listeners.forEach((l) => l());
}
const listeners = new Set<() => void>();
export function subscribeDownloads(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function downloadedSurahs(reciter: string): Record<string, SurahDownload> {
  return readManifest()[reciter] ?? {};
}
export function isDownloaded(reciter: string, surah: number): boolean {
  return !!readManifest()[reciter]?.[String(surah)];
}
export function totalBytes(): number {
  let n = 0;
  for (const r of Object.values(readManifest())) for (const s of Object.values(r)) n += s.bytes;
  return n;
}

// ---------- files ----------

/** A stable, filesystem-safe name for a remote file */
export function fileNameFor(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** Every file a surah needs for this reciter (surah file + any per-ayah fill-ins, or per-ayah files) */
export async function filesForSurah(reciter: string, surah: number, ayahCount: number): Promise<string[]> {
  const index = await loadAudioIndex(reciter);
  if (isSurahAudio(reciter) && index) {
    const src = index.src[surah - 1];
    const spans = index.verses[surah - 1] ?? [];
    const fallback = surahAudioFallback(reciter);
    const missing = Array.from({ length: ayahCount }, (_, i) => i + 1).filter((a) => !src || !spans[a - 1]);
    return [...(src ? [src] : []), ...missing.map((a) => getAudioUrl(surah, a, fallback))];
  }
  return Array.from({ length: ayahCount }, (_, i) => getAudioUrl(surah, i + 1, reciter));
}

let nativeBase: Promise<string> | null = null;
/** file:// URI of the app's download folder (no trailing slash) */
async function nativeDir(): Promise<string> {
  nativeBase ??= (async () => {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.mkdir({ path: 'audio', directory: Directory.Data, recursive: true }).catch(() => {});
    const { uri } = await Filesystem.getUri({ path: 'audio', directory: Directory.Data });
    return uri.replace(/\/$/, '');
  })();
  return nativeBase;
}

/**
 * For the native player: swap a remote URL for its downloaded copy when the surah
 * is downloaded for this reciter. Web needs no swap (the service worker serves it).
 */
export async function localUrlResolver(reciter: string): Promise<((url: string, surah: number) => string) | undefined> {
  if (!native()) return undefined;
  const done = readManifest()[reciter] ?? {};
  if (!Object.keys(done).length) return undefined;
  const dir = await nativeDir();
  return (url, surah) => (done[String(surah)] ? `${dir}/${fileNameFor(url)}` : url);
}

async function fetchOne(url: string): Promise<number> {
  if (native()) {
    const { FileTransfer } = await import('@capacitor/file-transfer');
    const { Filesystem } = await import('@capacitor/filesystem');
    const path = `${await nativeDir()}/${fileNameFor(url)}`;
    await FileTransfer.downloadFile({ url, path });
    // A truncated file would play as silence: check it has content
    const info = await Filesystem.stat({ path });
    if (!info.size) throw new Error('empty file');
    return info.size;
  }
  const cache = await caches.open(AUDIO_CACHE);
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('empty file');
  await cache.put(url, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg', 'Content-Length': String(blob.size) } }));
  return blob.size;
}

async function removeOne(url: string) {
  if (native()) {
    const { Filesystem } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: `${await nativeDir()}/${fileNameFor(url)}` }).catch(() => {});
    return;
  }
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(url);
}

// ---------- jobs ----------

export interface DownloadJob { reciter: string; surah: number; done: number; total: number; error?: string }
const jobs = new Map<string, DownloadJob & { cancelled?: boolean }>();
const jobKey = (reciter: string, surah: number) => `${reciter}/${surah}`;
export function activeJob(reciter: string, surah: number): DownloadJob | undefined {
  return jobs.get(jobKey(reciter, surah));
}

/** Download one surah's files (a few at a time); resolves when done, rejects on failure or cancel */
export async function downloadSurah(reciter: string, surah: number, ayahCount: number): Promise<void> {
  const key = jobKey(reciter, surah);
  if (jobs.has(key)) return;
  const urls = await filesForSurah(reciter, surah, ayahCount);
  const job: DownloadJob & { cancelled?: boolean } = { reciter, surah, done: 0, total: urls.length };
  jobs.set(key, job);
  listeners.forEach((l) => l());
  let bytes = 0;
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
      while (next < urls.length) {
        if (job.cancelled) throw new Error('cancelled');
        const url = urls[next++];
        // One retry: a dropped connection mid-surah shouldn't fail the lot
        const size = await fetchOne(url).catch(() => fetchOne(url));
        bytes += size;
        job.done++;
        listeners.forEach((l) => l());
      }
    }));
    const m = readManifest();
    (m[reciter] ??= {})[String(surah)] = { bytes, files: urls.length, at: Date.now() };
    writeManifest(m);
  } catch (e) {
    // Leave nothing half-done behind (but keep files another download shares)
    const shared = await sharedFiles(reciter, surah, ayahCount);
    await Promise.all(urls.filter((u) => !shared.has(u)).map((u) => removeOne(u)));
    job.error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    jobs.delete(key);
    listeners.forEach((l) => l());
  }
}

export function cancelDownload(reciter: string, surah: number) {
  const job = jobs.get(jobKey(reciter, surah));
  if (job) job.cancelled = true;
}

/** Files that other reciters' downloads of this surah also use (a shared fall-back collection) */
async function sharedFiles(reciter: string, surah: number, ayahCount: number): Promise<Set<string>> {
  const m = readManifest();
  const others = Object.keys(m).filter((r) => r !== reciter && m[r][String(surah)]);
  return new Set((await Promise.all(others.map((r) => filesForSurah(r, surah, ayahCount)))).flat());
}

export async function deleteSurah(reciter: string, surah: number, ayahCount: number) {
  const urls = await filesForSurah(reciter, surah, ayahCount);
  const shared = await sharedFiles(reciter, surah, ayahCount);
  await Promise.all(urls.filter((u) => !shared.has(u)).map((u) => removeOne(u)));
  const m = readManifest();
  if (m[reciter]) {
    delete m[reciter][String(surah)];
    if (!Object.keys(m[reciter]).length) delete m[reciter];
  }
  writeManifest(m);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
