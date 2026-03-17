'use client';

import { useAudio } from '@/hooks/use-audio';
import { cn } from '@/lib/cn';

interface AudioPlayerProps {
  url?: string;
  className?: string;
}

const SPEEDS = [0.75, 1, 1.25];

export default function AudioPlayer({ url, className }: AudioPlayerProps) {
  const { play, pause, isPlaying, setSpeed, currentTime, duration } = useAudio();

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePlayPause = async () => {
    if (!url) return;
    if (isPlaying) {
      pause();
    } else {
      await play(url);
    }
  };

  return (
    <div className={cn('flex items-center gap-3 rounded-xl bg-card p-3 shadow-sm', className)}>
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        disabled={!url}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-white disabled:opacity-40"
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2l10 6-10 6V2z" />
          </svg>
        )}
      </button>

      {/* Progress */}
      <div className="flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-teal transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Speed */}
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              'text-muted hover:text-foreground'
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
