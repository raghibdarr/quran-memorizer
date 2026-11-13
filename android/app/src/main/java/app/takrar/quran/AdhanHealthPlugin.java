package app.takrar.quran;

import android.app.Activity;
import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * What stands between a prayer alert and the user (src/lib/native-plugins.ts, AdhanHealth):
 * battery optimisation and the exact-alarm permission. It only reports and opens the system
 * screens; it never asks for the restricted direct battery exemption, the user decides there.
 */
@CapacitorPlugin(name = "AdhanHealth")
public class AdhanHealthPlugin extends Plugin {

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        call.resolve(value(ignoring));
    }

    /** The system list of apps and their battery optimisation, not the one-app exemption prompt */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    }

    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        boolean can = true; // Before Android 12 exact alarms need no permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            can = am != null && am.canScheduleExactAlarms();
        }
        call.resolve(value(can));
    }

    /** Android 12+: the app's "Alarms and reminders" screen; earlier versions have nothing to grant */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
        open(call, intent);
    }

    private void open(PluginCall call, Intent intent) {
        try {
            start(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            // Some OEM builds drop these screens: fall back to the app's own settings page
            try {
                start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
                call.resolve();
            } catch (Exception again) {
                call.reject("No settings screen to open");
            }
        } catch (Exception e) {
            call.reject("Couldn't open settings");
        }
    }

    /** From the activity when there is one, so Back returns to Takrar */
    private void start(Intent intent) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.startActivity(intent);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
    }

    private static JSObject value(boolean v) {
        JSObject ret = new JSObject();
        ret.put("value", v);
        return ret;
    }
}
