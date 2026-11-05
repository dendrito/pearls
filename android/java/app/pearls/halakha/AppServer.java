package app.pearls.halakha;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves the app from a private https origin instead of file:// (so the WebView needs no file access at all):
 *   https://appassets.androidplatform.net/www/...    the web app in assets/www
 *   https://appassets.androidplatform.net/dl/NAME    a downloaded recording, with Range support for seeking
 *   https://appassets.androidplatform.net/proxy?u=   text from ph.yhb.org.il, fetched natively (the site sends
 *                                                    duplicate CORS headers, which browsers reject)
 * Everything else (the audio CDN, links) goes to the network as usual.
 */
final class AppServer {
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/www/index.html";
    static final String DL_BASE = "https://" + HOST + "/dl/";
    private static final String UA = "Pearls (Android)";
    private final Context ctx;

    AppServer(Context ctx) { this.ctx = ctx; }

    static boolean ours(Uri u) { return u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost()); }

    WebResourceResponse handle(WebResourceRequest req) {
        Uri u = req.getUrl();
        if (!ours(u)) return null;
        String path = u.getPath() == null ? "/" : u.getPath();
        try {
            if (path.startsWith("/www/")) return asset(path.substring(1));
            if (path.startsWith("/dl/")) return download(path.substring(4), header(req, "Range"));
            if (path.equals("/proxy")) return proxy(u.getQueryParameter("u"));
        } catch (Exception e) { /* fall through to 404 */ }
        return notFound();
    }

    private static String header(WebResourceRequest req, String name) {
        Map<String, String> h = req.getRequestHeaders();
        if (h == null) return null;
        for (Map.Entry<String, String> e : h.entrySet()) if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        return null;
    }

    private static String mime(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js")) return "text/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".json") || l.endsWith(".webmanifest")) return "application/json";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".woff2")) return "font/woff2";
        if (l.endsWith(".woff")) return "font/woff";
        if (l.endsWith(".ttf")) return "font/ttf";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        return "application/octet-stream";
    }
    private static boolean text(String m) { return m.startsWith("text/") || m.equals("application/json") || m.equals("image/svg+xml"); }

    private WebResourceResponse asset(String path) throws IOException {
        if (path.contains("..")) return notFound();
        InputStream in = ctx.getAssets().open(path);
        String m = mime(path);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        return new WebResourceResponse(m, text(m) ? "utf-8" : null, 200, "OK", h, in);
    }

    private WebResourceResponse download(String name, String range) throws IOException {
        if (!name.matches("[A-Za-z0-9._-]{1,80}") || name.endsWith(".part")) return notFound();
        File base = ctx.getExternalFilesDir(null);
        if (base == null) return notFound();
        File f = new File(new File(base, "dl"), name);
        if (!f.isFile()) return notFound();
        long len = f.length(), start = 0, end = len - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            String[] r = range.substring(6).split(",")[0].trim().split("-", -1);
            try {
                if (r[0].isEmpty()) { start = Math.max(0, len - Long.parseLong(r[1])); }
                else { start = Long.parseLong(r[0]); if (r.length > 1 && !r[1].isEmpty()) end = Math.min(len - 1, Long.parseLong(r[1])); }
                partial = true;
            } catch (NumberFormatException e) { start = 0; end = len - 1; }
        }
        Map<String, String> h = new HashMap<>();
        h.put("Accept-Ranges", "bytes");
        if (start >= len) { h.put("Content-Range", "bytes */" + len); return new WebResourceResponse("audio/mpeg", null, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0])); }
        FileInputStream in = new FileInputStream(f);
        long skipped = 0;
        while (skipped < start) { long s = in.skip(start - skipped); if (s <= 0) break; skipped += s; }
        long count = end - start + 1;
        h.put("Content-Length", String.valueOf(count));
        if (partial) h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
        return new WebResourceResponse(mime(name), null, partial ? 206 : 200, partial ? "Partial Content" : "OK", h, new Limited(in, count));
    }

    private WebResourceResponse proxy(String target) throws IOException {
        if (target == null) return notFound();
        Uri t = Uri.parse(target);
        if (!"https".equals(t.getScheme()) || !("ph.yhb.org.il".equals(t.getHost()) || "cdn1.yhb.org.il".equals(t.getHost()))) return notFound();
        HttpURLConnection c = (HttpURLConnection) new URL(target).openConnection();
        c.setConnectTimeout(20000); c.setReadTimeout(25000);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Accept", "application/json");
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) in = new ByteArrayInputStream(new byte[0]);
        String ct = c.getContentType() == null ? "application/json" : c.getContentType().split(";")[0].trim();
        String reason = c.getResponseMessage();
        return new WebResourceResponse(ct, "utf-8", code, reason == null || reason.isEmpty() ? "OK" : reason, new HashMap<String, String>(), in);
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** An InputStream that ends after n bytes (for Range responses). */
    private static final class Limited extends FilterInputStream {
        private long left;
        Limited(InputStream in, long n) { super(in); left = n; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int b = super.read(); if (b >= 0) left--; return b; }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int r = super.read(b, off, (int) Math.min(len, left));
            if (r > 0) left -= r;
            return r;
        }
    }
}
