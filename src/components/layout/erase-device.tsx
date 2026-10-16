'use client';

import { useState } from 'react';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import { Capacitor } from '@capacitor/core';
import { clearAudioCache } from '@/lib/storage';

/**
 * Wipes everything Takrar keeps on this device: progress, settings, the sign-in
 * session and cached audio. Cloud data (if signed in) is untouched; deleting that
 * is the account sheet's job.
 */
export async function eraseThisDevice() {
  try { localStorage.clear(); } catch { /* storage blocked: nothing to clear */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  await clearAudioCache().catch(() => {});
  // Your own recordings (src/lib/recordings.ts)
  await new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('takrar-recordings');
      req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  // Downloaded recitations in the apps' own storage (src/lib/downloads.ts)
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({ path: 'audio', directory: Directory.Data, recursive: true }).catch(() => {});
  }
  if ('caches' in window) {
    const names = await caches.keys().catch(() => [] as string[]);
    await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
  }
  window.location.replace('/');
}

export default function EraseDevice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 min-h-11 w-full rounded-xl text-xs font-medium text-muted transition-colors hover:text-red-500"
        data-erase-device
      >
        Erase everything on this device
      </button>
      <ConfirmSheet
        open={open}
        title="Erase this device?"
        message="This removes your progress, settings, sign-in and downloaded audio from this device. It can't be undone, so export a backup first if you might want it back. Progress synced to an account stays in the cloud."
        confirmLabel="Erase this device"
        destructive
        onConfirm={() => { setOpen(false); void eraseThisDevice(); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
