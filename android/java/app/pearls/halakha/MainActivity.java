package app.pearls.halakha;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Insets;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * Pearls: a WebView around the web app, served from https://appassets.androidplatform.net (AppServer) with no
 * file access. Also:
 *  - edge to edge (required from Android 15): the WebView sits in a container padded by the system bars and the
 *    keyboard; the container's colour (the skin's, via PearlsBridge.setBars) shows behind the bars;
 *  - PearlsNative bridge (downloads, saved text, bars, player state);
 *  - headphones: "audio becoming noisy" and a MediaSession, passed to the page as window.PEARLS_MEDIA(cmd);
 *  - PlaybackService keeps audio playing in the background with a media notification and lock-screen controls.
 * The first launch after the move from file:// copies the page's saved data across (migrate.html).
 */
public class MainActivity extends Activity {
    private static MainActivity current;
    private WebView web;
    private FrameLayout root;
    private MediaSession session;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) toPage("noisy");
        }
    };

    /** A command from the notification, earbuds or the system: play, pause, next, prev, noisy. */
    static void command(String cmd) { if (current != null) current.toPage(cmd); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        int ink = 0xFF0B0F1A;
        Window w = getWindow();
        root = new FrameLayout(this);
        root.setBackgroundColor(ink);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);          // edge to edge everywhere it's available, not only Android 15+
            w.setStatusBarColor(0); w.setNavigationBarColor(0);
            if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                    Insets bars = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    Insets ime = in.getInsets(WindowInsets.Type.ime());
                    v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                    return WindowInsets.CONSUMED;
                }
            });
        } else {
            w.setStatusBarColor(ink); w.setNavigationBarColor(ink);
        }

        web = new WebView(this);
        web.setBackgroundColor(ink);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);                    // everything comes from AppServer; assets stay readable
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        final AppServer server = new AppServer(this);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return server.handle(r); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (AppServer.ours(u) || "file".equals(u.getScheme())) return false;   // our pages stay in the app
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* nothing to open it */ }
                return true;                                                           // links open in the browser
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new PearlsBridge(this, web), "PearlsNative");
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        session = new MediaSession(this, "Pearls");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { toPage("play"); }
            @Override public void onPause() { toPage("pause"); }
            @Override public void onStop() { toPage("pause"); }
            @Override public void onSkipToNext() { toPage("next"); }
            @Override public void onSkipToPrevious() { toPage("prev"); }
        });
        PlaybackService.token = session.getSessionToken();
        setMediaState(false, null, null, 0, 1f);

        if (Build.VERSION.SDK_INT >= 33)                 // Android 16 apps get back gestures only through this callback
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new android.window.OnBackInvokedCallback() { @Override public void onBackInvoked() { back(); } });

        boolean migrated = getSharedPreferences("pearls", MODE_PRIVATE).getBoolean("migrated", false);
        web.loadUrl(migrated ? AppServer.HOME : "file:///android_asset/www/migrate.html");
    }

    /** The skin's background colour behind the system bars, and dark or light bar icons. */
    void setBars(int color, boolean light) {
        root.setBackgroundColor(color);
        web.setBackgroundColor(color);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            int m = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (w.getInsetsController() != null) w.getInsetsController().setSystemBarsAppearance(light ? m : 0, m);
        } else {
            w.setStatusBarColor(color); w.setNavigationBarColor(color);
            int flags = w.getDecorView().getSystemUiVisibility();
            flags = light ? (flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            if (Build.VERSION.SDK_INT >= 26)
                flags = light ? (flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            w.getDecorView().setSystemUiVisibility(flags);
        }
    }

    private void toPage(String cmd) {
        if (web != null) web.evaluateJavascript("window.PEARLS_MEDIA&&window.PEARLS_MEDIA('" + cmd + "')", null);
    }

    /** Called by the page (through PearlsBridge.mediaState) whenever playback starts, pauses or changes chapter. */
    void mediaState(String json) {
        try {
            JSONObject o = new JSONObject(json);
            boolean playing = o.optBoolean("playing");
            String title = o.has("title") ? o.optString("title") : null, artist = o.has("artist") ? o.optString("artist") : null;
            setMediaState(playing, title, artist, o.optLong("pos", 0), (float) o.optDouble("speed", 1));
            PlaybackService.update(this, playing, title, artist);
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
        PlaybackService.update(this, false, null, null);
        if (session != null) { session.setActive(false); session.release(); session = null; }
        if (current == this) current = null;
        super.onDestroy();
    }

    private void back() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);       // keep playing in the background instead of closing the player
    }

    @Override
    public void onBackPressed() { back(); }
}
