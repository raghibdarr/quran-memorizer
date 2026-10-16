package app.takrar.quran.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import app.takrar.quran.MainActivity;
import app.takrar.quran.R;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Home-screen widget (roadmap #17). The app writes the next week's due counts (by
 * local date) plus the streak and khatm lines (TakrarWidgetPlugin); the widget
 * picks today's entry itself, so it stays right on days the app isn't opened.
 */
public class TakrarWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "takrar_widget";
    static final String KEY = "data";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TakrarWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    static RemoteViews views(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.takrar_widget);
        String main = context.getString(R.string.widget_open);
        String sub = "";
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY, null);
            if (raw != null) {
                JSONObject data = new JSONObject(raw);
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                JSONObject due = data.optJSONObject("due");
                int n = due != null ? due.optInt(today, -1) : -1;
                if (n > 0) main = n == 1 ? "1 review today" : n + " reviews today";
                else if (n == 0) main = "Reviews done";
                StringBuilder s = new StringBuilder();
                int streak = data.optInt("streak", 0);
                if (streak > 0) s.append(streak).append(" day streak");
                String khatm = data.optString("khatm", "");
                if (!khatm.isEmpty()) {
                    if (s.length() > 0) s.append(" · ");
                    s.append(khatm);
                }
                sub = s.toString();
            }
        } catch (Exception ignored) {
            // Bad data: show the plain "Open Takrar"
        }
        v.setTextViewText(R.id.widget_main, main);
        v.setTextViewText(R.id.widget_sub, sub);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.widget_root, tap);
        return v;
    }
}
