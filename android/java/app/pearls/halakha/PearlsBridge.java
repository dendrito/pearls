package app.pearls.halakha;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.StatFs;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * window.PearlsNative: offline storage for the web app.
 *
 * Audio downloads go through Android's DownloadManager (keeps going with the app closed, Wi-Fi-only if asked)
 * into <external app files>/dl/NAME.part and are renamed to NAME when status() sees them finished, so a file
 * without ".part" is always complete. The page plays them from file:// URLs.
 * Text (Hebrew chapters fetched from ph.yhb.org.il) is kept as small files in <app files>/text/.
 * Every method is called from JavaScript on the WebView's bridge thread and returns plain strings or JSON.
 */
public class PearlsBridge {
    private static final String UA = "Pearls (Android; offline downloads)";
    private final Activity act;
    private final WebView web;

    PearlsBridge(Activity act, WebView web) { this.act = act; this.web = web; }

    private File dlDir() {
        File base = act.getExternalFilesDir(null);
        if (base == null) return null;
        File d = new File(base, "dl");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private File textDir() {
        File d = new File(act.getFilesDir(), "text");
        if (!d.exists()) d.mkdirs();
        return d;
    }
    private DownloadManager dm() { return (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE); }
    private static boolean safeName(String n) { return n != null && n.matches("[A-Za-z0-9._-]{1,80}") && !n.contains(".."); }

    /** {dir, free, online, metered, ok} */
    @JavascriptInterface
    public String info() {
        JSONObject o = new JSONObject();
        try {
            File d = dlDir();
            o.put("ok", d != null);
            if (d != null) {
                o.put("dir", Uri.fromFile(d).toString() + "/");
                StatFs st = new StatFs(d.getAbsolutePath());
                o.put("free", st.getAvailableBytes());
            }
            o.put("online", online());
            o.put("metered", metered());
        } catch (Exception e) { /* return what we have */ }
        return o.toString();
    }

    @SuppressWarnings("deprecation")
    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }
    private boolean metered() {
        ConnectivityManager cm = (ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
        return cm == null || cm.isActiveNetworkMetered();
    }

    /** Names of downloads DownloadManager is still working on (pending, running or paused). */
    private java.util.Set<String> activeNames() {
        java.util.Set<String> s = new java.util.HashSet<>();
        DownloadManager.Query q = new DownloadManager.Query();
        q.setFilterByStatus(DownloadManager.STATUS_PENDING | DownloadManager.STATUS_RUNNING | DownloadManager.STATUS_PAUSED);
        Cursor c = dm().query(q);
        if (c == null) return s;
        try {
            int di = c.getColumnIndex(DownloadManager.COLUMN_DESCRIPTION);
            while (c.moveToNext()) s.add(c.getString(di));
        } finally { c.close(); }
        return s;
    }

    /** jobs: [{url, name, title}]. Skips files already downloaded or in progress. Returns how many were queued. */
    @JavascriptInterface
    public int enqueue(String jobsJson, boolean wifiOnly) {
        File d = dlDir();
        if (d == null) return -1;
        int n = 0;
        try {
            JSONArray jobs = new JSONArray(jobsJson);
            java.util.Set<String> active = activeNames();
            for (int i = 0; i < jobs.length(); i++) {
                JSONObject j = jobs.getJSONObject(i);
                String url = j.getString("url"), name = j.getString("name");
                if (!safeName(name) || !(url.startsWith("https://") || url.startsWith("http://"))) continue;
                if (new File(d, name).exists() || active.contains(name)) continue;
                File part = new File(d, name + ".part");
                if (part.exists()) part.delete();
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setDestinationInExternalFilesDir(act, "dl", name + ".part");
                r.setTitle(j.optString("title", name));
                r.setDescription(name);
                r.addRequestHeader("User-Agent", UA);
                r.setAllowedOverMetered(!wifiOnly);
                r.setAllowedOverRoaming(!wifiOnly);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                dm().enqueue(r);
                n++;
            }
        } catch (Exception e) { return n == 0 ? -2 : n; }
        return n;
    }

    /**
     * Finishes completed downloads (NAME.part -> NAME) and reports the rest:
     * {active:[{name, status, done, total}], finished:[name], failed:[{name, reason}]}
     */
    @JavascriptInterface
    public String status() {
        JSONObject out = new JSONObject();
        JSONArray active = new JSONArray(), finished = new JSONArray(), failed = new JSONArray();
        File d = dlDir();
        try {
            Cursor c = dm().query(new DownloadManager.Query());
            if (c != null) {
                try {
                    int ii = c.getColumnIndex(DownloadManager.COLUMN_ID), di = c.getColumnIndex(DownloadManager.COLUMN_DESCRIPTION),
                        si = c.getColumnIndex(DownloadManager.COLUMN_STATUS), bi = c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                        ti = c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES), ri = c.getColumnIndex(DownloadManager.COLUMN_REASON);
                    while (c.moveToNext()) {
                        long id = c.getLong(ii);
                        String name = c.getString(di);
                        int st = c.getInt(si);
                        if (!safeName(name) || d == null) continue;
                        if (st == DownloadManager.STATUS_SUCCESSFUL) {
                            File part = new File(d, name + ".part"), fin = new File(d, name);
                            if (part.exists() && part.length() > 0) { if (fin.exists()) fin.delete(); part.renameTo(fin); }
                            dm().remove(id);   // the record only: the file has been renamed away from its path
                            if (fin.exists()) finished.put(name);
                        } else if (st == DownloadManager.STATUS_FAILED) {
                            JSONObject f = new JSONObject();
                            f.put("name", name); f.put("reason", c.getInt(ri));
                            failed.put(f);
                            dm().remove(id);
                            new File(d, name + ".part").delete();
                        } else {
                            JSONObject a = new JSONObject();
                            a.put("name", name); a.put("status", st == DownloadManager.STATUS_PAUSED ? "paused" : st == DownloadManager.STATUS_RUNNING ? "running" : "pending");
                            a.put("done", c.getLong(bi)); a.put("total", c.getLong(ti)); a.put("reason", c.getInt(ri));
                            active.put(a);
                        }
                    }
                } finally { c.close(); }
            }
            out.put("active", active); out.put("finished", finished); out.put("failed", failed);
        } catch (Exception e) { /* partial result */ }
        return out.toString();
    }

    /** Completed downloads: [{n: name, s: bytes}] */
    @JavascriptInterface
    public String list() {
        JSONArray a = new JSONArray();
        File d = dlDir();
        if (d == null) return a.toString();
        File[] fs = d.listFiles();
        if (fs == null) return a.toString();
        try {
            for (File f : fs) {
                if (f.getName().endsWith(".part") || !f.isFile()) continue;
                JSONObject o = new JSONObject(); o.put("n", f.getName()); o.put("s", f.length()); a.put(o);
            }
        } catch (Exception e) { /* partial */ }
        return a.toString();
    }

    /** Deletes the named downloads, finished or in progress. namesJson: ["BB-CC-SS-he.mp3", ...] */
    @JavascriptInterface
    public int remove(String namesJson) {
        File d = dlDir();
        if (d == null) return 0;
        int n = 0;
        try {
            JSONArray names = new JSONArray(namesJson);
            java.util.Set<String> want = new java.util.HashSet<>();
            for (int i = 0; i < names.length(); i++) if (safeName(names.getString(i))) want.add(names.getString(i));
            Cursor c = dm().query(new DownloadManager.Query());
            if (c != null) {
                try {
                    int ii = c.getColumnIndex(DownloadManager.COLUMN_ID), di = c.getColumnIndex(DownloadManager.COLUMN_DESCRIPTION);
                    while (c.moveToNext()) if (want.contains(c.getString(di))) dm().remove(c.getLong(ii));
                } finally { c.close(); }
            }
            for (String name : want) {
                if (new File(d, name).delete()) n++;
                new File(d, name + ".part").delete();
            }
        } catch (Exception e) { /* partial */ }
        return n;
    }

    /** Cancels every download in progress and deletes partial files (finished files stay). */
    @JavascriptInterface
    public void cancelAll() {
        Cursor c = dm().query(new DownloadManager.Query());
        if (c != null) {
            try {
                int ii = c.getColumnIndex(DownloadManager.COLUMN_ID);
                while (c.moveToNext()) dm().remove(c.getLong(ii));
            } finally { c.close(); }
        }
        File d = dlDir();
        File[] fs = d == null ? null : d.listFiles();
        if (fs != null) for (File f : fs) if (f.getName().endsWith(".part")) f.delete();
    }

    /* ---------- text kept for offline reading ---------- */
    @JavascriptInterface
    public String readText(String key) {
        if (!safeName(key)) return null;
        File f = new File(textDir(), key);
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int r;
            while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    @JavascriptInterface
    public boolean writeText(String key, String content) {
        if (!safeName(key) || content == null) return false;
        File tmp = new File(textDir(), key + ".tmp"), fin = new File(textDir(), key);
        try (OutputStream o = new FileOutputStream(tmp)) {
            o.write(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { tmp.delete(); return false; }
        if (fin.exists()) fin.delete();
        return tmp.renameTo(fin);
    }

    /** Saved texts: [{n, s}] */
    @JavascriptInterface
    public String textList() {
        JSONArray a = new JSONArray();
        File[] fs = textDir().listFiles();
        if (fs == null) return a.toString();
        try {
            for (File f : fs) {
                if (f.getName().endsWith(".tmp")) continue;
                JSONObject o = new JSONObject(); o.put("n", f.getName()); o.put("s", f.length()); a.put(o);
            }
        } catch (Exception e) { /* partial */ }
        return a.toString();
    }

    @JavascriptInterface
    public int clearText() {
        int n = 0;
        File[] fs = textDir().listFiles();
        if (fs != null) for (File f : fs) if (f.delete()) n++;
        return n;
    }

    /* ---------- player state for the MediaSession (earbuds, headphone buttons) ---------- */
    @JavascriptInterface
    public void mediaState(final String json) {
        act.runOnUiThread(new Runnable() {
            @Override public void run() { if (act instanceof MainActivity) ((MainActivity) act).mediaState(json); }
        });
    }

    /* ---------- system bars follow the skin: "#RRGGBB", light = dark icons ---------- */
    @JavascriptInterface
    public void setBars(final String hex, final boolean light) {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    int c = 0xFF000000 | Integer.parseInt(hex.replace("#", ""), 16);
                    Window w = act.getWindow();
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                    web.setBackgroundColor(c);
                    int flags = w.getDecorView().getSystemUiVisibility();
                    flags = light ? (flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
                    if (android.os.Build.VERSION.SDK_INT >= 26)
                        flags = light ? (flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                    w.getDecorView().setSystemUiVisibility(flags);
                } catch (Exception e) { /* ignore a bad colour */ }
            }
        });
    }
}
