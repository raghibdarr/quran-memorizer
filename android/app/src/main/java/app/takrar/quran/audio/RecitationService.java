package app.takrar.quran.audio;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;
import app.takrar.quran.MainActivity;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the recitation player's MediaSession: Media3 shows the playback
 * notification, keeps this service in the foreground while it plays (so Android
 * doesn't stop it with the screen off), and routes lock-screen, Bluetooth and
 * headset buttons to the player. As a library service it also lets Android Auto
 * browse the surahs and play one (roadmap #20, RecitationLibrary).
 */
public class RecitationService extends MediaLibraryService {

    private @Nullable MediaLibrarySession session;

    @Override
    public void onCreate() {
        super.onCreate();
        RecitationEngine engine = RecitationEngine.get(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaLibrarySession.Builder(this, engine.player, new LibraryCallback()).setSessionActivity(tap).build();
    }

    @Override
    public @Nullable MediaLibrarySession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    private final class LibraryCallback implements MediaLibrarySession.Callback {
        @Override
        public @NonNull ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(
                @NonNull MediaLibrarySession s, @NonNull MediaSession.ControllerInfo browser, @Nullable LibraryParams params) {
            return Futures.immediateFuture(LibraryResult.ofItem(RecitationLibrary.root(), params));
        }

        @Override
        public @NonNull ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
                @NonNull MediaLibrarySession s, @NonNull MediaSession.ControllerInfo browser, @NonNull String parentId,
                int page, int pageSize, @Nullable LibraryParams params) {
            if (!RecitationLibrary.ROOT.equals(parentId)) return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params));
            List<MediaItem> all = RecitationLibrary.surahs(RecitationService.this);
            int from = Math.max(0, page * pageSize);
            int to = Math.min(all.size(), from + Math.max(1, pageSize));
            List<MediaItem> slice = from < to ? all.subList(from, to) : new ArrayList<>();
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(slice), params));
        }

        @Override
        public @NonNull ListenableFuture<LibraryResult<MediaItem>> onGetItem(
                @NonNull MediaLibrarySession s, @NonNull MediaSession.ControllerInfo browser, @NonNull String mediaId) {
            MediaItem item = RecitationLibrary.surahItem(RecitationService.this, mediaId);
            return Futures.immediateFuture(item != null ? LibraryResult.ofItem(item, null) : LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
        }

        /** A surah chosen in the car: hand the engine its whole queue and play it */
        @Override
        public @NonNull ListenableFuture<MediaSession.MediaItemsWithStartPosition> onSetMediaItems(
                @NonNull MediaSession s, @NonNull MediaSession.ControllerInfo controller, @NonNull List<MediaItem> mediaItems,
                int startIndex, long startPositionMs) {
            if (mediaItems.size() == 1 && mediaItems.get(0).mediaId.startsWith(RecitationLibrary.SURAH)) {
                List<RecitationEngine.Item> queue = RecitationLibrary.queueFor(RecitationService.this, mediaItems.get(0).mediaId);
                if (!queue.isEmpty()) {
                    RecitationEngine engine = RecitationEngine.get(RecitationService.this);
                    return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(engine.adopt(queue), 0, 0));
                }
            }
            return MediaLibrarySession.Callback.super.onSetMediaItems(s, controller, mediaItems, startIndex, startPositionMs);
        }
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // Swiped away from recents: keep reciting if it's playing, otherwise go
        Player player = session != null ? session.getPlayer() : null;
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) stopSelf();
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.release();
            session = null;
        }
        RecitationEngine engine = RecitationEngine.peek();
        if (engine != null) engine.release();
        super.onDestroy();
    }
}
