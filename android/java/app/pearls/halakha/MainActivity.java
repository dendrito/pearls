package app.pearls.halakha;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Pearls: a WebView around the web app in assets/www, plus
 *  - the PearlsNative bridge (offline downloads, saved text, system bars), and
 *  - headphone handling: Android's "audio becoming noisy" warning (Bluetooth earbuds disconnect, wired headphones
 *    unplugged) and a MediaSession, so earbuds that pause when taken out (in-ear detection) and earbud taps reach
 *    the player. Both are passed to the page as window.PEARLS_MEDIA("noisy" | "play" | "pause" | "next" | "prev").
 *    Whether a disconnect pauses is the user's setting, decided in the page.
 */
public class MainActivity extends Activity {
    private WebView web;
    private MediaSession session;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) toPage("noisy");
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        int ink = 0xFF0B0F1A;
        w.setStatusBarColor(ink);
        w.setNavigationBarColor(ink);

        web = new WebView(this);
        web.setBackgroundColor(ink);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);                    // play downloaded audio from the app's files folder
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);   // the site's CORS headers are malformed; the page is local
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new PearlsBridge(this, web), "PearlsNative");
        setContentView(web);

        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        session = new MediaSession(this, "Pearls");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { toPage("play"); }
            @Override public void onPause() { toPage("pause"); }
            @Override public void onStop() { toPage("pause"); }
            @Override public void onSkipToNext() { toPage("next"); }
            @Override public void onSkipToPrevious() { toPage("prev"); }
        });
        setMediaState(false, null, null, 0, 1f);

        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void toPage(String cmd) {
        if (web != null) web.evaluateJavascript("window.PEARLS_MEDIA&&window.PEARLS_MEDIA('" + cmd + "')", null);
    }

    /** Called by the page (through PearlsBridge.mediaState) whenever playback starts, pauses or changes chapter. */
    void mediaState(String json) {
        try {
            JSONObject o = new JSONObject(json);
            setMediaState(o.optBoolean("playing"), o.optString("title", null), o.optString("artist", null),
                    o.optLong("pos", 0), (float) o.optDouble("speed", 1));
        } catch (Exception e) { /* ignore */ }
    }

    private void setMediaState(boolean playing, String title, String artist, long posMs, float speed) {
        if (session == null) return;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, posMs, playing ? speed : 0f)
                .build());
        if (title != null) session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist == null ? "Peninei Halakha" : artist)
                .build());
        // active while there is something to play, so earbud buttons and in-ear detection come to Pearls
        session.setActive(title != null || playing);
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(noisy); } catch (Exception e) { /* not registered */ }
        if (session != null) { session.setActive(false); session.release(); session = null; }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
