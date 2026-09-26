package app.takrar.quran;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Crisp Android haptics (src/lib/haptics.ts). @capacitor/haptics drives the
 * vibration motor with fixed waveforms (its "light" impact is a 50ms pulse),
 * which feels like an old buzz. View.performHapticFeedback plays the
 * platform's tuned effects instead — the short ticks and clicks the system UI
 * and well-made apps use — and honours the user's touch-feedback setting.
 */
@CapacitorPlugin(name = "SystemHaptics")
public class SystemHapticsPlugin extends Plugin {

    @PluginMethod
    public void perform(PluginCall call) {
        final int feedback = feedbackFor(call.getString("type", "press"));
        getActivity().runOnUiThread(() -> {
            View view = getBridge().getWebView();
            if (view != null) view.performHapticFeedback(feedback);
            call.resolve();
        });
    }

    private static int feedbackFor(String type) {
        switch (type) {
            case "selection":
                // The lightest tick, made for values stepping past
                return Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
            case "success":
                return Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
            case "press":
            default:
                // A small bump: lighter than VIRTUAL_KEY's click
                return HapticFeedbackConstants.CONTEXT_CLICK;
        }
    }
}
