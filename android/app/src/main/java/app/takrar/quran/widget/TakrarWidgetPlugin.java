package app.takrar.quran.widget;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The page hands the widget its data (src/lib/widget.ts); the widget redraws */
@CapacitorPlugin(name = "TakrarWidget")
public class TakrarWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject data = call.getData();
        Context ctx = getContext();
        ctx.getSharedPreferences(TakrarWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TakrarWidgetProvider.KEY, data.toString())
            .apply();
        TakrarWidgetProvider.refreshAll(ctx);
        call.resolve();
    }
}
