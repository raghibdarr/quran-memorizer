import { createStore, get, set, del, clear } from 'idb-keyval';

const audioStore = createStore('quran-memorizer', 'audio-cache');

export async function cacheAudio(key: string, blob: Blob): Promise<void> {
  await set(key, blob, audioStore);
}

export async function getCachedAudio(key: string): Promise<Blob | undefined> {
  return get<Blob>(key, audioStore);
}

export async function removeCachedAudio(key: string): Promise<void> {
  await del(key, audioStore);
}

export async function clearAudioCache(): Promise<void> {
  await clear(audioStore);
}
