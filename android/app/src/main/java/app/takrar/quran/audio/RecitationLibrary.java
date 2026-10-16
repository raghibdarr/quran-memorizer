package app.takrar.quran.audio;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What Android Auto (and other media browsers) can browse and play without the app's
 * page running (roadmap #20): the 114 surahs in the current reciter's voice. The page
 * writes the reciter and surah names here (RecitationPlayerPlugin.setLibrary); a surah
 * plays as one whole file where the reciter has surah audio, else ayah by ayah, and
 * from downloaded copies when present (src/lib/downloads.ts names them).
 */
final class RecitationLibrary {

    static final String ROOT = "root";
    static final String SURAH = "surah:";
    private static final String PREFS = "takrar_library";

    private RecitationLibrary() {}

    static void save(Context ctx, JSONObject data) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", data.toString()).apply();
    }

    private static JSONObject load(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = p.getString("data", null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {
            // fall back to defaults
        }
        return new JSONObject();
    }

    static MediaItem root() {
        return new MediaItem.Builder()
            .setMediaId(ROOT)
            .setMediaMetadata(new MediaMetadata.Builder().setTitle("Takrar").setIsBrowsable(true).setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED).build())
            .build();
    }

    static List<MediaItem> surahs(Context ctx) {
        JSONObject d = load(ctx);
        JSONArray names = d.optJSONArray("names");
        String reciter = d.optString("reciterName", "");
        List<MediaItem> out = new ArrayList<>(114);
        for (int s = 1; s <= 114; s++) {
            String name = names != null ? names.optString(s - 1, "Surah " + s) : "Surah " + s;
            out.add(new MediaItem.Builder()
                .setMediaId(SURAH + s)
                .setMediaMetadata(new MediaMetadata.Builder()
                    .setTitle(s + ". " + name)
                    .setArtist(reciter)
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .build())
                .build());
        }
        return out;
    }

    static @Nullable MediaItem surahItem(Context ctx, String mediaId) {
        if (!mediaId.startsWith(SURAH)) return null;
        int s = parse(mediaId);
        return s >= 1 && s <= 114 ? surahs(ctx).get(s - 1) : null;
    }

    private static int parse(String mediaId) {
        try { return Integer.parseInt(mediaId.substring(SURAH.length())); } catch (Exception e) { return -1; }
    }

    /** The queue for a surah: one whole-file item, or one item per ayah */
    static List<RecitationEngine.Item> queueFor(Context ctx, String mediaId) {
        List<RecitationEngine.Item> out = new ArrayList<>();
        int s = parse(mediaId);
        if (s < 1 || s > 114) return out;
        JSONObject d = load(ctx);
        String reciter = d.optString("reciter", "Alafasy_128kbps");
        String fallback = d.optString("fallback", reciter);
        String reciterName = d.optString("reciterName", "");
        JSONArray names = d.optJSONArray("names");
        JSONArray counts = d.optJSONArray("counts");
        String name = names != null ? names.optString(s - 1, "Surah " + s) : "Surah " + s;
        int ayahs = counts != null ? counts.optInt(s - 1, 0) : 0;
        String surahFile = surahAudioSrc(ctx, reciter, s);
        if (surahFile != null) {
            out.add(new RecitationEngine.Item(local(ctx, surahFile), 0, androidx.media3.common.C.TIME_END_OF_SOURCE, name, reciterName, s + ":1-" + ayahs + "#0"));
            return out;
        }
        String dir = surahFile == null && d.optBoolean("surahAudio", false) ? fallback : reciter;
        for (int a = 1; a <= ayahs; a++) {
            String url = String.format(Locale.US, "https://everyayah.com/data/%s/%03d%03d.mp3", dir, s, a);
            out.add(new RecitationEngine.Item(local(ctx, url), 0, androidx.media3.common.C.TIME_END_OF_SOURCE, name + " · " + a, reciterName, s + ":" + a + "-" + a + "#0"));
        }
        return out;
    }

    /** A surah-audio reciter's file for this surah, from the bundled audio-index.json */
    private static @Nullable String surahAudioSrc(Context ctx, String reciter, int surah) {
        try (InputStream in = ctx.getAssets().open("public/segments/" + reciter + "/audio-index.json")) {
            java.io.ByteArrayOutputStream all = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int r; (r = in.read(buf)) > 0; ) all.write(buf, 0, r);
            JSONArray src = new JSONObject(all.toString(StandardCharsets.UTF_8.name())).optJSONArray("src");
            String url = src != null ? src.optString(surah - 1, null) : null;
            return url == null || url.isEmpty() || "null".equals(url) ? null : url;
        } catch (Exception e) {
            return null; // a per-ayah reciter: no index
        }
    }

    /** The downloaded copy (src/lib/downloads.ts fileNameFor) when there is one */
    private static String local(Context ctx, String url) {
        String fileName = url.replaceFirst("^https?://", "").replaceAll("[^A-Za-z0-9._-]+", "_");
        File f = new File(new File(ctx.getFilesDir(), "audio"), fileName);
        return f.exists() && f.length() > 0 ? Uri.fromFile(f).toString() : url;
    }
}
