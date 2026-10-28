package app.pearls.halakha;

import android.app.Activity;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** Pearls: a WebView around the web app in assets/www, plus the PearlsNative bridge for offline downloads. */
public class MainActivity extends Activity {
    private WebView web;

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
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
