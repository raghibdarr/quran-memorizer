package app.takrar.quran.audio;

import android.app.PendingIntent;
import android.content.Intent;
import androidx.annotation.Nullable;
import androidx.media3.common.Player;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import app.takrar.quran.MainActivity;

/**
 * Hosts the recitation player's MediaSession: Media3 shows the playback
 * notification, keeps this service in the foreground while it plays (so Android
 * doesn't stop it with the screen off), and routes lock-screen, Bluetooth and
 * headset buttons to the player.
 */
public class RecitationService extends MediaSessionService {

    private @Nullable MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        RecitationEngine engine = RecitationEngine.get(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, engine.player).setSessionActivity(tap).build();
    }

    @Override
    public @Nullable MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
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
