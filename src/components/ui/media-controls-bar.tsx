'use client';

import { useRef, useState } from 'react';
import { useAudio } from '@/hooks/use-audio';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/cn';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

interface MediaControlsBarProps {
  /** Whether a play-all sequence is currently active. */
  playingAll: boolean;
  /** Index of the currently-playing item (0-based), or -1 if none. */
  currentIdx: number;
  /** Total items in the sequence (e.g., ayah count). */
  total: number;
  /** Text shown when idle. */
  idleLabel?: string;
  /** Start playing the full sequence. */
  onPlayAll: () => void;
  /** Stop playback. */
  onStop: () => void;
  /** Optional restart-from-beginning slot (e.g., used by ListenPhase). */
  onRestart?: () => void;
  className?: string;
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MediaControlsBar({
  playingAll,
  currentIdx,
  total,
  idleLabel = 'Tap play or ayah',
  onPlayAll,
  onStop,
  onRestart,
  className,
}: MediaControlsBarProps) {
  const { isPlaying, isPaused, setSpeed, seek, currentTime, duration, pause, resume } = useAudio();
  const storedSpeed = useSettingsStore((s) => s.playbackSpeed);
  const setStoredSpeed = useSettingsStore((s) => s.setPlaybackSpeed);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const hasDuration = duration > 0;
  const interactive = playingAll && hasDuration;
  const displayTime = scrubTime !== null ? scrubTime : currentTime;
  const progress = hasDuration ? (displayTime / duration) * 100 : 0;

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !hasDuration) return null;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const t = seekFromClientX(e.clientX);
    if (t === null) return;
    setScrubTime(t);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubTime === null) return;
    const t = seekFromClientX(e.clientX);
    if (t !== null) setScrubTime(t);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubTime === null) return;
    seek(scrubTime);
    setScrubTime(null);
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const handlePlayPause = () => {
    if (playingAll && isPlaying) pause();
    else if (playingAll && isPaused) resume();
    else onPlayAll();
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    setStoredSpeed(s);
    setShowSpeedMenu(false);
  };

  return (
    <div
      className={cn('sticky rounded-2xl bg-card p-3 tactile-card', className)}
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      {/* Scrubber + time */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="w-9 text-[10px] tabular-nums text-muted text-left">{fmtTime(displayTime)}</span>
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn('relative h-3 flex-1 touch-none', interactive ? 'cursor-pointer' : 'cursor-default')}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-teal"
              style={{ width: `${progress}%`, transition: scrubTime !== null ? 'none' : 'width 100ms linear' }}
            />
          </div>
          {interactive && (
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal shadow-sm"
              style={{ left: `${progress}%`, transition: scrubTime !== null ? 'none' : 'left 100ms linear' }}
            />
          )}
        </div>
        <span className="w-9 text-[10px] tabular-nums text-muted text-right">{fmtTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {onRestart && (
          <button
            onClick={onRestart}
            disabled={!playingAll}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
            title="Restart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
        )}

        <button
          onClick={handlePlayPause}
          className="tactile-btn flex h-12 w-12 items-center justify-center rounded-full bg-teal text-on-teal hover:bg-teal-light"
        >
          {playingAll && isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z" /></svg>
          )}
        </button>

        <button
          onClick={onStop}
          disabled={!playingAll}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-30"
          title="Stop"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
        </button>

        <div className="flex-1 text-center">
          <p className="text-xs text-muted">
            {playingAll && currentIdx >= 0 ? `Ayah ${currentIdx + 1} / ${total}` : idleLabel}
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="rounded-lg bg-foreground/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-foreground/10"
          >
            {storedSpeed}x
          </button>
          {showSpeedMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
              <div className="absolute bottom-8 right-0 z-50 rounded-xl bg-card ink-border py-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    className={cn(
                      'block w-full px-4 py-1.5 text-left text-xs font-medium',
                      s === storedSpeed ? 'text-teal bg-teal/5' : 'text-foreground hover:bg-foreground/5',
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
