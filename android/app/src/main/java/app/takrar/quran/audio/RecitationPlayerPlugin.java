package app.takrar.quran.audio;

import android.content.ComponentName;
import android.content.Context;
import androidx.media3.common.C;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * JavaScript side of the recitation player (src/lib/native-player.ts). The page
 * hands over a whole queue once; from then on the engine plays it on its own and
 * reports back with events: "item", "state", "progress", "ended", "error".
 */
@CapacitorPlugin(name = "RecitationPlayer")
public class RecitationPlayerPlugin extends Plugin implements RecitationEngine.Listener {

    private ListenableFuture<MediaController> controller;

    private RecitationEngine engine() {
        RecitationEngine e = RecitationEngine.get(getContext());
        e.addListener(this);
        return e;
    }

    /** Bind to the session service so Media3 can promote it to the foreground while playing */
    private void ensureService() {
        boolean alive = false;
        if (controller != null && controller.isDone()) {
            try {
                MediaController c = controller.get();
                alive = c != null && c.isConnected();
            } catch (Exception ignored) {
                // a failed connection: build a new one
            }
        } else if (controller != null) {
            alive = true; // still connecting
        }
        if (alive) return;
        Context ctx = getContext();
        SessionToken token = new SessionToken(ctx, new ComponentName(ctx, RecitationService.class));
        controller = new MediaController.Builder(ctx, token).buildAsync();
        controller.addListener(() -> {}, MoreExecutors.directExecutor());
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        JSArray raw = call.getArray("items");
        List<RecitationEngine.Item> items = new ArrayList<>();
        try {
            for (int i = 0; raw != null && i < raw.length(); i++) {
                JSONObject o = raw.getJSONObject(i);
                items.add(new RecitationEngine.Item(
                    o.getString("url"),
                    o.optLong("startMs", 0),
                    o.has("endMs") && !o.isNull("endMs") ? o.getLong("endMs") : C.TIME_END_OF_SOURCE,
                    o.optString("title", ""),
                    o.optString("subtitle", ""),
                    o.optString("tag", String.valueOf(i))));
            }
        } catch (Exception e) {
            call.reject("Bad queue: " + e.getMessage());
            return;
        }
        if (items.isEmpty()) {
            call.reject("Empty queue");
            return;
        }
        final int start = call.getInt("startIndex", 0);
        final long startPos = call.getLong("startPositionMs", 0L);
        final long pause = call.getLong("pauseMs", 0L);
        final float pauseTimes = call.getFloat("pauseFactor", 0f);
        final boolean loop = Boolean.TRUE.equals(call.getBoolean("loop", false));
        final float rate = call.getFloat("rate", 1f);
        final boolean autoplay = !Boolean.FALSE.equals(call.getBoolean("autoplay", true));
        getActivity().runOnUiThread(() -> {
            ensureService();
            engine().setQueue(items, start, startPos, pause, pauseTimes, loop, rate, autoplay);
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> { ensureService(); engine().play(); call.resolve(); });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> { engine().pause(); call.resolve(); });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { engine().stop(); call.resolve(); });
    }

    @PluginMethod
    public void seekToItem(PluginCall call) {
        final int index = call.getInt("index", 0);
        final long pos = call.getLong("positionMs", 0L);
        getActivity().runOnUiThread(() -> { engine().seekToItem(index, pos); call.resolve(); });
    }

    @PluginMethod
    public void setRate(PluginCall call) {
        final float rate = call.getFloat("rate", 1f);
        getActivity().runOnUiThread(() -> { engine().setRate(rate); call.resolve(); });
    }

    @PluginMethod
    public void setSleepTimer(PluginCall call) {
        final double minutes = call.getDouble("minutes", -1.0);
        final long fade = call.getLong("fadeMs", 8000L);
        getActivity().runOnUiThread(() -> { engine().setSleepTimer(minutes, fade); call.resolve(); });
    }

    /** What Android Auto can browse: the reciter and the surah names and lengths */
    @PluginMethod
    public void setLibrary(PluginCall call) {
        RecitationLibrary.save(getContext(), call.getData());
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            RecitationEngine e = engine();
            JSObject r = new JSObject();
            int i = e.currentIndex();
            r.put("index", i);
            r.put("tag", e.tagAt(i));
            r.put("positionMs", e.currentPositionMs());
            r.put("playing", e.isPlaying());
            r.put("count", e.itemCount());
            r.put("sleepRemainingMs", e.sleepRemainingMs());
            call.resolve(r);
        });
    }

    // ---- engine events → JS ----

    @Override public void onItem(int index, String tag) {
        JSObject o = new JSObject();
        o.put("index", index);
        o.put("tag", tag);
        notifyListeners("item", o);
    }

    @Override public void onState(boolean playing, boolean buffering) {
        JSObject o = new JSObject();
        o.put("playing", playing);
        o.put("buffering", buffering);
        notifyListeners("state", o);
    }

    @Override public void onProgress(int index, long positionMs, long durationMs) {
        JSObject o = new JSObject();
        o.put("index", index);
        o.put("positionMs", positionMs);
        o.put("durationMs", durationMs);
        o.put("at", System.currentTimeMillis());
        notifyListeners("progress", o);
    }

    @Override public void onEnded(String reason) {
        JSObject o = new JSObject();
        o.put("reason", reason);
        notifyListeners("ended", o);
    }

    @Override public void onError(String message) {
        JSObject o = new JSObject();
        o.put("message", message);
        notifyListeners("error", o);
    }

    @Override
    protected void handleOnDestroy() {
        RecitationEngine e = RecitationEngine.peek();
        if (e != null) e.removeListener(this);
        if (controller != null) MediaController.releaseFuture(controller);
        controller = null;
        super.handleOnDestroy();
    }
}
