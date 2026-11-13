package app.takrar.quran.widget;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The page hands the widget its data (src/components/widget-sync.tsx, typed in
 * src/lib/native-plugins.ts); the widget redraws.
 * v2: an optional `prayers` array [{name, at (epoch ms)}] and `prayerTz`. Entries
 * that aren't a name and a time are dropped; no array means no prayer line.
 */
@CapacitorPlugin(name = "TakrarWidget")
public class TakrarWidgetPlugin extends Plugin {

    /** A week of five prayers is 35; anything far beyond that is a bug upstream */
    private static final int MAX_PRAYERS = 64;

    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        JSONArray prayers = data.optJSONArray("prayers");
        if (prayers != null) {
            JSArray clean = new JSArray();
            for (int i = 0; i < prayers.length() && clean.length() < MAX_PRAYERS; i++) {
                JSONObject p = prayers.optJSONObject(i);
                if (p == null) continue;
                String name = p.optString("name", "");
                long at = p.optLong("at", 0);
                if (name.isEmpty() || at <= 0) continue;
                JSObject entry = new JSObject();
                entry.put("name", name);
                entry.put("at", at);
                clean.put(entry);
            }
            data.put("prayers", clean);
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(TakrarWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TakrarWidgetProvider.KEY, data.toString())
            .apply();
        TakrarWidgetProvider.refreshAll(ctx);
        call.resolve();
    }
}
