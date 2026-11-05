package app.pearls.halakha;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The phone's own voices, as the app sees them (the Android twin of apple/Pearls/AppleVoice.swift). The WebView has no
 * working speechSynthesis, so without this the "This phone's voice" choice read nothing. TextToSpeech renders a piece to
 * a WAV, which the page plays through the same two players as the natural voices: pause, the lock screen, the paragraph
 * highlight and the reading speed work as they do there. Served by AppServer at /native/device-voice/…:
 *   list                 [{id, name, lang, quality: veryhigh|high|default, gender: male|female|}] English only, voices on
 *                        the phone only (a network voice would send the text to a server), best first, male first
 *   say?text=&id=&rate=  a WAV (16-bit mono), header X-Gen-Seconds
 * Both calls come from AppServer, on a WebView background thread, so they may wait.
 */
final class DeviceVoice {
    private static DeviceVoice shared;
    static synchronized DeviceVoice get(Context c) { if (shared == null) shared = new DeviceVoice(c.getApplicationContext()); return shared; }

    private final Context ctx;
    private TextToSpeech tts;
    private boolean ready;
    private final Map<String, CountDownLatch> wait = new HashMap<>();
    private final Map<String, Boolean> failed = new HashMap<>();
    private int seq;

    private DeviceVoice(Context c) { ctx = c; }

    /** Google's voices have codes for names; these are the ones whose voice is known to be a man's or a woman's. */
    private static final Map<String, String> GENDER = new HashMap<>();
    static {
        String[] male = { "iol", "iom", "tpd", "gbb", "gbd", "rjs", "aub", "aud", "end", "ene" };
        String[] female = { "iob", "iog", "sfg", "tpc", "tpf", "gba", "gbc", "gbg", "aua", "auc", "ena", "enc" };
        for (String m : male) GENDER.put(m, "male");
        for (String f : female) GENDER.put(f, "female");
    }
    private static String code(Voice v) {   // "en-gb-x-rjs-local" -> "rjs"
        String[] p = v.getName().toLowerCase(Locale.ROOT).split("-");
        for (int i = 0; i + 1 < p.length; i++) if ("x".equals(p[i])) return p[i + 1];
        return "";
    }
    static String gender(Voice v) {
        String n = v.getName().toLowerCase(Locale.ROOT), g = GENDER.get(code(v));
        if (g != null) return g;
        if (n.contains("female")) return "female";   // Samsung and others: "en-US-SMTf00"…; some say it in the name
        if (n.contains("male")) return "male";
        return "";
    }
    static String quality(Voice v) {
        int q = v.getQuality();
        return q >= Voice.QUALITY_VERY_HIGH ? "veryhigh" : q >= Voice.QUALITY_HIGH ? "high" : "default";
    }
    private static boolean installed(Voice v) {
        Set<String> f = v.getFeatures();
        return !v.isNetworkConnectionRequired() && (f == null || !f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
    }

    /** Starts the engine on the main thread and waits for it (at most 8 s). */
    private synchronized boolean start() {
        if (ready && tts != null) return true;
        final CountDownLatch up = new CountDownLatch(1);
        final boolean[] ok = { false };
        new Handler(Looper.getMainLooper()).post(new Runnable() { @Override public void run() {
            tts = new TextToSpeech(ctx, new TextToSpeech.OnInitListener() { @Override public void onInit(int status) { ok[0] = status == TextToSpeech.SUCCESS; up.countDown(); } });
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { finish(id, true); }
                @Override public void onError(String id) { finish(id, false); }
                @Override public void onError(String id, int code) { finish(id, false); }
            });
        } });
        try { up.await(8, TimeUnit.SECONDS); } catch (InterruptedException e) { return false; }
        ready = ok[0];
        return ready;
    }
    private void finish(String id, boolean ok) {
        CountDownLatch l;
        synchronized (wait) { l = wait.remove(id); if (!ok) failed.put(id, true); }
        if (l != null) l.countDown();
    }

    private List<Voice> english() {
        List<Voice> out = new ArrayList<>();
        Set<Voice> all = null;
        try { all = tts.getVoices(); } catch (Exception e) { /* an engine that lists nothing */ }
        if (all == null) return out;
        for (Voice v : all) if (v.getLocale() != null && "en".equals(v.getLocale().getLanguage()) && installed(v)) out.add(v);
        return out;
    }
    private static String label(Voice v) {
        Locale l = v.getLocale();
        String cc = l.getCountry(), where = cc.isEmpty() ? "English" : ("GB".equals(cc) ? "UK" : "US".equals(cc) ? "US" : l.getDisplayCountry(Locale.ENGLISH)) + " English";
        String c = code(v).toUpperCase(Locale.ROOT);   // the gender and quality are shown apart, so not in the name
        return where + (c.isEmpty() ? "" : " " + c);
    }

    String list() {
        JSONArray a = new JSONArray();
        if (!start()) return a.toString();
        List<Voice> vs = english();
        final Map<String, Integer> rank = new HashMap<>();
        rank.put("veryhigh", 0); rank.put("high", 1); rank.put("default", 2);
        Collections.sort(vs, new Comparator<Voice>() { @Override public int compare(Voice x, Voice y) {
            int q = rank.get(quality(x)) - rank.get(quality(y));
            if (q != 0) return q;
            int m = ("male".equals(gender(x)) ? 0 : 1) - ("male".equals(gender(y)) ? 0 : 1);
            if (m != 0) return m;
            return label(x).compareTo(label(y));
        } });
        for (Voice v : vs) {
            try {
                JSONObject o = new JSONObject();
                o.put("id", v.getName()); o.put("name", label(v)); o.put("lang", v.getLocale().toLanguageTag());
                o.put("quality", quality(v)); o.put("gender", gender(v));
                a.put(o);
            } catch (Exception e) { /* skip it */ }
        }
        return a.toString();
    }

    /** One piece of text -> WAV bytes; [0] the bytes, [1] seconds taken (as a Double). One at a time: one engine. */
    synchronized Object[] say(String text, String id, float rate) throws IOException {
        if (!start()) throw new IOException("the phone's speech engine did not start");
        Voice voice = null;
        for (Voice v : english()) if (v.getName().equals(id)) voice = v;
        if (voice == null) { List<Voice> e = english(); if (!e.isEmpty()) voice = e.get(0); }
        if (voice != null) tts.setVoice(voice); else tts.setLanguage(Locale.UK);
        tts.setSpeechRate(Math.max(0.5f, Math.min(2f, rate)));
        File f = new File(ctx.getCacheDir(), "device-voice.wav");
        f.delete();
        String uid = "p" + (++seq);
        CountDownLatch l = new CountDownLatch(1);
        synchronized (wait) { wait.put(uid, l); }
        long t0 = System.nanoTime();
        int r = tts.synthesizeToFile(text, new Bundle(), f, uid);
        if (r != TextToSpeech.SUCCESS) { synchronized (wait) { wait.remove(uid); } throw new IOException("the phone's voice refused the text"); }
        boolean done;
        try { done = l.await(60, TimeUnit.SECONDS); } catch (InterruptedException e) { done = false; }
        boolean bad;
        synchronized (wait) { wait.remove(uid); bad = failed.remove(uid) != null; }
        if (!done) throw new IOException("the phone's voice made no sound in a minute");
        if (bad || f.length() <= 44) throw new IOException("the phone's voice could not read this piece");
        byte[] b = new byte[(int) f.length()];
        try (FileInputStream in = new FileInputStream(f)) { int n = 0; while (n < b.length) { int k = in.read(b, n, b.length - n); if (k < 0) break; n += k; } }
        f.delete();
        return new Object[] { b, (System.nanoTime() - t0) / 1e9 };
    }
}
