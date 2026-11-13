package app.takrar.quran.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;
import app.takrar.quran.MainActivity;
import app.takrar.quran.R;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget (roadmap #17). The app writes the next week's due counts (by
 * local date) plus the streak and khatm lines (TakrarWidgetPlugin); the widget
 * picks today's entry itself, so it stays right on days the app isn't opened.
 *
 * v2 (all-in-one spec 3.4): the app may also write the next days' prayers as
 * [{name, at (epoch ms)}]. The widget shows "Next: Asr 3:42 pm" in place of its
 * title, picking the next entry each time it draws, and sets one inexact alarm
 * for that prayer's time so the line moves on without waiting for the periodic
 * update. Payloads without prayers draw exactly as before.
 */
public class TakrarWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "takrar_widget";
    static final String KEY = "data";
    static final String ACTION_REFRESH = "app.takrar.quran.widget.REFRESH";
    /** How late the refresh after a prayer may run; still inexact, so no permission is needed */
    static final long REFRESH_WINDOW_MS = 10 * 60_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject data = readData(context);
        long now = System.currentTimeMillis();
        for (int id : ids) manager.updateAppWidget(id, views(context, data, now));
        scheduleRefresh(context, nextPrayer(data, now));
    }

    @Override
    public void onDisabled(Context context) {
        // The last widget is gone: no reason to wake up for the next prayer
        scheduleRefresh(context, null);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TakrarWidgetProvider.class));
        JSONObject data = readData(context);
        long now = System.currentTimeMillis();
        for (int id : ids) manager.updateAppWidget(id, views(context, data, now));
        scheduleRefresh(context, ids.length > 0 ? nextPrayer(data, now) : null);
    }

    static JSONObject readData(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY, null);
            return raw != null ? new JSONObject(raw) : null;
        } catch (Exception e) {
            return null; // Bad data: draw the plain "Open Takrar"
        }
    }

    /** The first prayer still to come, or null (no place set, or the list has run out) */
    static JSONObject nextPrayer(JSONObject data, long now) {
        JSONArray prayers = data != null ? data.optJSONArray("prayers") : null;
        if (prayers == null) return null;
        JSONObject best = null;
        for (int i = 0; i < prayers.length(); i++) {
            JSONObject p = prayers.optJSONObject(i);
            if (p == null) continue;
            long at = p.optLong("at", 0);
            if (at > now && !p.optString("name", "").isEmpty() && (best == null || at < best.optLong("at"))) best = p;
        }
        return best;
    }

    /** "3:42 pm", or "15:42" when the phone uses the 24-hour clock; in the place's zone when known */
    static String formatTime(Context context, long at, String tzId) {
        boolean h24 = DateFormat.is24HourFormat(context);
        SimpleDateFormat f = new SimpleDateFormat(h24 ? "HH:mm" : "h:mm a", Locale.US);
        TimeZone tz = TimeZone.getDefault();
        if (tzId != null && !tzId.isEmpty()) {
            TimeZone place = TimeZone.getTimeZone(tzId);
            // getTimeZone answers GMT for an id it doesn't know: keep the phone's zone then
            if (place.getID().equals(tzId)) tz = place;
        }
        f.setTimeZone(tz);
        return f.format(new Date(at)).toLowerCase(Locale.US);
    }

    static RemoteViews views(Context context, JSONObject data, long now) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.takrar_widget);
        String main = context.getString(R.string.widget_open);
        String sub = "";
        String prayerLine = "";
        try {
            if (data != null) {
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
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
                JSONObject next = nextPrayer(data, now);
                if (next != null) {
                    prayerLine = "Next: " + next.optString("name") + " " + formatTime(context, next.optLong("at"), data.optString("prayerTz", ""));
                }
            }
        } catch (Exception ignored) {
            // Bad data: show what was read so far, else the plain "Open Takrar"
        }
        v.setTextViewText(R.id.widget_main, main);
        v.setTextViewText(R.id.widget_sub, sub);
        v.setTextViewText(R.id.widget_prayer, prayerLine);
        v.setViewVisibility(R.id.widget_prayer, prayerLine.isEmpty() ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.widget_title, prayerLine.isEmpty() ? View.VISIBLE : View.GONE);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.widget_root, tap);
        return v;
    }

    /**
     * One inexact, non-waking alarm just after the next prayer, so the "Next" line moves on;
     * null cancels it. Inexact needs no permission and costs no battery: if the phone is
     * asleep it fires when the screen next comes on, which is when the widget is seen.
     */
    static void scheduleRefresh(Context context, JSONObject next) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(context, TakrarWidgetProvider.class).setAction(ACTION_REFRESH);
            PendingIntent pi = PendingIntent.getBroadcast(context, 2, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            if (next == null) am.cancel(pi);
            // A window, not set(): plain set() may slide by 75% of the wait (hours, overnight)
            else am.setWindow(AlarmManager.RTC, next.optLong("at") + 1000, REFRESH_WINDOW_MS, pi);
        } catch (Exception ignored) {
            // The periodic update still keeps the widget roughly right
        }
    }
}
