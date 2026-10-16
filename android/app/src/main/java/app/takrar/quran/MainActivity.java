package app.takrar.quran;

import android.os.Bundle;
import app.takrar.quran.audio.RecitationPlayerPlugin;
import app.takrar.quran.widget.TakrarWidgetPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge starts
        registerPlugin(SystemHapticsPlugin.class);
        registerPlugin(RecitationPlayerPlugin.class);
        registerPlugin(TakrarWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
