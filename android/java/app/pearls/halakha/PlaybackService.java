package app.pearls.halakha;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.session.MediaSession;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps Pearls playing with the screen off or the app in the background: a foreground service of type
 * mediaPlayback with a media notification (play/pause, previous, next; also shown on the lock screen) tied to the
 * activity's MediaSession. The audio itself plays in the WebView; buttons are passed to the page through
 * MainActivity.command(). While playing it holds a partial wake lock so the CPU keeps feeding the audio.
 */
public class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private static final int ID = 1;
    static final String ACTION_SHOW = "app.pearls.SHOW", ACTION_STOP = "app.pearls.STOP";
    static MediaSession.Token token;
    private PowerManager.WakeLock wake;
    private boolean foreground;

    /** Called by MainActivity when playback state changes. */
    static void update(Context c, boolean playing, String title, String artist) {
        Intent i = new Intent(c, PlaybackService.class).setAction(title == null ? ACTION_STOP : ACTION_SHOW)
                .putExtra("playing", playing).putExtra("title", title).putExtra("artist", artist);
        try {
            if (title == null) c.startService(i);
            else if (playing && Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception e) { /* background start not allowed right now; the next state change retries */ }
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        String a = i == null ? null : i.getAction();
        if (a == null || ACTION_STOP.equals(a)) { stop(); return START_NOT_STICKY; }
        if (!ACTION_SHOW.equals(a)) {                    // a notification button
            MainActivity.command(a);
            return START_NOT_STICKY;
        }
        boolean playing = i.getBooleanExtra("playing", false);
        Notification n = build(playing, i.getStringExtra("title"), i.getStringExtra("artist"));
        if (playing) {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(ID, n);
            foreground = true;
            lock(true);
        } else {
            if (foreground) { stopForeground(STOP_FOREGROUND_DETACH); foreground = false; }
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ID, n);   // paused: swipe-away-able
            lock(false);
        }
        return START_NOT_STICKY;
    }

    private Notification build(boolean playing, String title, String artist) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("What Pearls is playing, with play and pause");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), f);
        b.setSmallIcon(R.drawable.ic_stat)
         .setContentTitle(title == null ? "Pearls" : title)
         .setContentText(artist == null ? "Peninei Halakha" : artist)
         .setContentIntent(open)
         .setVisibility(Notification.VISIBILITY_PUBLIC)
         .setOnlyAlertOnce(true)
         .setShowWhen(false)
         .setOngoing(playing)
         .setDeleteIntent(PendingIntent.getService(this, 9, new Intent(this, PlaybackService.class).setAction(ACTION_STOP), f))
         .addAction(action(android.R.drawable.ic_media_previous, "Previous", "prev", 1))
         .addAction(playing ? action(android.R.drawable.ic_media_pause, "Pause", "pause", 2) : action(android.R.drawable.ic_media_play, "Play", "play", 3))
         .addAction(action(android.R.drawable.ic_media_next, "Next", "next", 4));
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (token != null) style.setMediaSession(token);
        b.setStyle(style);
        return b.build();
    }

    private Notification.Action action(int icon, String label, String cmd, int code) {
        PendingIntent pi = PendingIntent.getService(this, code, new Intent(this, PlaybackService.class).setAction(cmd),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build();
    }

    private void lock(boolean on) {
        if (on) {
            if (wake == null) {
                wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Pearls:playback");
                wake.setReferenceCounted(false);
            }
            wake.acquire(6 * 60 * 60 * 1000L);     // released on pause; capped at 6 h in case nothing pauses it
        } else if (wake != null && wake.isHeld()) wake.release();
    }

    private void stop() {
        lock(false);
        if (foreground) { stopForeground(STOP_FOREGROUND_REMOVE); foreground = false; }
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(ID);
        stopSelf();
    }

    @Override public void onTaskRemoved(Intent root) { MainActivity.command("pause"); stop(); }
    @Override public void onDestroy() { lock(false); super.onDestroy(); }
}
