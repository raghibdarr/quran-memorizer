package app.takrar.quran.audio;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.ArrayList;
import java.util.List;

/**
 * The recitation player (roadmap #01): one ExoPlayer that plays a whole queue of
 * ayahs (or slices of whole-surah files) natively, so playback, repeats, pauses
 * and the sleep timer keep going with the screen off — the WebView's JavaScript is
 * suspended then and can't sequence anything. RecitationService wraps the player
 * in a MediaSession for the lock screen, notification and headset buttons.
 *
 * Main thread only (ExoPlayer's application looper).
 */
public final class RecitationEngine {

    /** One queue entry. Repeats are expanded by the caller (one item per play). */
    public static final class Item {
        public final String url;
        public final long startMs;
        public final long endMs; // C.TIME_END_OF_SOURCE for the whole file
        public final String title;
        public final String subtitle;
        public final String tag; // opaque to us; echoed back in events (e.g. "18:10#2")

        public Item(String url, long startMs, long endMs, String title, String subtitle, String tag) {
            this.url = url;
            this.startMs = startMs;
            this.endMs = endMs;
            this.title = title;
            this.subtitle = subtitle;
            this.tag = tag;
        }
    }

    public interface Listener {
        void onItem(int index, String tag);
        void onState(boolean playing, boolean buffering);
        void onProgress(int index, long positionMs, long durationMs);
        void onEnded(String reason);
        void onError(String message);
    }

    private static RecitationEngine instance;

    public static synchronized RecitationEngine get(Context context) {
        if (instance == null) instance = new RecitationEngine(context.getApplicationContext());
        return instance;
    }

    public static synchronized @Nullable RecitationEngine peek() {
        return instance;
    }

    final ExoPlayer player;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Listener> listeners = new ArrayList<>();
    private List<Item> items = new ArrayList<>();
    private long pauseMs = 0;
    /** Extra pause as a multiple of the item just played (time to say it back) */
    private float pauseFactor = 0f;
    private boolean loop = false;
    private float volume = 1f;

    // Sleep timer: a wall-clock deadline, or "stop when this item ends"
    private long sleepAt = 0;
    private boolean sleepAfterItem = false;
    private long fadeMs = 8000;
    private boolean fading = false;

    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            emitProgress();
            handler.postDelayed(this, 250);
        }
    };
    private final Runnable resumeAfterPause = this::advanceAfterPause;
    private final Runnable sleepCheck = new Runnable() {
        @Override public void run() {
            if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) startFadeOut();
            else if (sleepAt > 0) handler.postDelayed(this, 1000);
        }
    };

    private RecitationEngine(Context context) {
        player = new ExoPlayer.Builder(context)
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(), /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true) // headphones out → pause
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        player.addListener(new Player.Listener() {
            @Override public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                int i = player.getCurrentMediaItemIndex();
                if (i >= 0 && i < items.size()) for (Listener l : listeners) l.onItem(i, items.get(i).tag);
                if (sleepAfterItem && reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    sleepAfterItem = false;
                    player.pause();
                    for (Listener l : listeners) l.onEnded("sleep");
                }
            }

            @Override public void onIsPlayingChanged(boolean isPlaying) {
                handler.removeCallbacks(progressTick);
                if (isPlaying) handler.post(progressTick);
                emitState();
            }

            @Override public void onPlaybackStateChanged(int state) {
                emitState();
                if (state == Player.STATE_ENDED) {
                    handler.removeCallbacks(progressTick);
                    for (Listener l : listeners) l.onEnded("queue");
                }
            }

            @Override public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                // pauseAtEndOfMediaItems stopped us at an item's end: wait, then go on
                if (!playWhenReady && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                    if (sleepAfterItem) {
                        sleepAfterItem = false;
                        for (Listener l : listeners) l.onEnded("sleep");
                        return;
                    }
                    long played = player.getDuration();
                    long extra = played > 0 && played != C.TIME_UNSET ? (long) (played * pauseFactor) : 0;
                    handler.postDelayed(resumeAfterPause, pauseMs + extra);
                } else if (!playWhenReady) {
                    // Paused from the lock screen or headphones during a pause: stay paused
                    handler.removeCallbacks(resumeAfterPause);
                }
            }

            @Override public void onPlayerError(@NonNull PlaybackException error) {
                for (Listener l : listeners) l.onError(error.getErrorCodeName());
            }
        });
    }

    public void addListener(Listener l) { if (!listeners.contains(l)) listeners.add(l); }
    public void removeListener(Listener l) { listeners.remove(l); }

    /** Replace the queue and start at `startIndex`, `startPositionMs` into it */
    public void setQueue(List<Item> next, int startIndex, long startPositionMs, long pauseBetweenMs, float pauseTimes, boolean loopQueue, float rate, boolean autoplay) {
        handler.removeCallbacks(resumeAfterPause);
        items = new ArrayList<>(next);
        pauseMs = Math.max(0, pauseBetweenMs);
        pauseFactor = Math.max(0f, pauseTimes);
        loop = loopQueue;
        List<MediaItem> media = new ArrayList<>(items.size());
        for (int i = 0; i < items.size(); i++) media.add(toMediaItem(items.get(i), i));
        player.setMediaItems(media, Math.max(0, Math.min(startIndex, media.size() - 1)), Math.max(0, startPositionMs));
        // With a pause between items we stop at each end and resume ourselves;
        // otherwise ExoPlayer moves on gaplessly (and loops the queue itself)
        boolean pauses = pauseMs > 0 || pauseFactor > 0;
        player.setPauseAtEndOfMediaItems(pauses);
        player.setRepeatMode(!pauses && loop ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
        player.setPlaybackParameters(new PlaybackParameters(rate));
        restoreVolume();
        player.prepare();
        player.setPlayWhenReady(autoplay);
    }

    private MediaItem toMediaItem(Item item, int index) {
        MediaItem.ClippingConfiguration.Builder clip = new MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs(Math.max(0, item.startMs));
        if (item.endMs > 0 && item.endMs != C.TIME_END_OF_SOURCE) clip.setEndPositionMs(item.endMs);
        return new MediaItem.Builder()
            .setUri(Uri.parse(item.url))
            .setMediaId(String.valueOf(index))
            .setClippingConfiguration(clip.build())
            .setMediaMetadata(new MediaMetadata.Builder()
                .setTitle(item.title)
                .setArtist(item.subtitle)
                .setDisplayTitle(item.title)
                .build())
            .build();
    }

    private void advanceAfterPause() {
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
            player.play();
        } else if (loop && !items.isEmpty()) {
            player.seekTo(0, 0);
            player.play();
        } else {
            player.stop();
            for (Listener l : listeners) l.onEnded("queue");
        }
    }

    public void play() {
        if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
        if (player.getPlaybackState() == Player.STATE_ENDED) player.seekTo(0, 0);
        restoreVolume();
        player.play();
    }

    public void pause() {
        handler.removeCallbacks(resumeAfterPause);
        player.pause();
    }

    public void stop() {
        handler.removeCallbacks(resumeAfterPause);
        cancelSleep();
        player.stop();
        player.clearMediaItems();
        items = new ArrayList<>();
    }

    public void seekToItem(int index, long positionMs) {
        handler.removeCallbacks(resumeAfterPause);
        if (index >= 0 && index < player.getMediaItemCount()) player.seekTo(index, Math.max(0, positionMs));
    }

    public void setRate(float rate) {
        player.setPlaybackParameters(new PlaybackParameters(rate));
    }

    /** minutes > 0: fade out and pause after that long; minutes == 0: at the end of this item; < 0: off */
    public void setSleepTimer(double minutes, long fadeOutMs) {
        cancelSleep();
        fadeMs = Math.max(0, fadeOutMs);
        if (minutes > 0) {
            sleepAt = System.currentTimeMillis() + (long) (minutes * 60_000);
            handler.postDelayed(sleepCheck, 1000);
        } else if (minutes == 0) {
            sleepAfterItem = true;
        }
    }

    public long sleepRemainingMs() {
        return sleepAt > 0 ? Math.max(0, sleepAt - System.currentTimeMillis()) : sleepAfterItem ? 0 : -1;
    }

    private void cancelSleep() {
        sleepAt = 0;
        sleepAfterItem = false;
        handler.removeCallbacks(sleepCheck);
        if (fading) {
            fading = false;
            restoreVolume();
        }
    }

    private void startFadeOut() {
        sleepAt = 0;
        fading = true;
        final long steps = Math.max(1, fadeMs / 100);
        final float start = player.getVolume();
        for (int s = 1; s <= steps; s++) {
            final int step = s;
            handler.postDelayed(() -> {
                if (!fading) return;
                player.setVolume(start * (1f - (float) step / steps));
                if (step == steps) {
                    fading = false;
                    player.pause();
                    player.setVolume(volume);
                    for (Listener l : listeners) l.onEnded("sleep");
                }
            }, s * 100L);
        }
    }

    private void restoreVolume() {
        player.setVolume(volume);
    }

    private void emitState() {
        boolean buffering = player.getPlaybackState() == Player.STATE_BUFFERING;
        for (Listener l : listeners) l.onState(player.isPlaying(), buffering);
    }

    private void emitProgress() {
        int i = player.getCurrentMediaItemIndex();
        long duration = player.getDuration();
        for (Listener l : listeners) l.onProgress(i, player.getCurrentPosition(), duration == C.TIME_UNSET ? -1 : duration);
    }

    public int currentIndex() { return player.getCurrentMediaItemIndex(); }
    public long currentPositionMs() { return player.getCurrentPosition(); }
    public boolean isPlaying() { return player.isPlaying(); }
    public int itemCount() { return items.size(); }
    public @Nullable String tagAt(int i) { return i >= 0 && i < items.size() ? items.get(i).tag : null; }

    void release() {
        handler.removeCallbacksAndMessages(null);
        player.release();
        synchronized (RecitationEngine.class) { instance = null; }
    }
}
