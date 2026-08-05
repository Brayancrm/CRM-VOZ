package com.pritesh.calldetection;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Bolha flutuante do SeCretina sobre outros apps (SYSTEM_ALERT_WINDOW).
 * Usa FGS tipo microphone (já usado no app) — specialUse crashava em vários Samsung.
 */
public final class KoomindBubbleService extends Service {

    private static final String TAG = "KooMindBubble";
    public static final String ACTION_START = "com.koomind.action.START_BUBBLE";
    public static final String ACTION_STOP = "com.koomind.action.STOP_BUBBLE";
    private static final String PREFS = "secretina_bubble";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_X = "x";
    private static final String KEY_Y = "y";
    private static final String CHANNEL_ID = "secretina-bubble";
    private static final int NOTIFICATION_ID = 42001;

    private static volatile boolean running = false;

    private WindowManager windowManager;
    private FrameLayout bubbleView;
    private WindowManager.LayoutParams layoutParams;
    private int bubbleSizePx;
    private float downRawX;
    private float downRawY;
    private int downX;
    private int downY;
    private boolean moved;
    private boolean foregroundStarted = false;

    public static boolean isRunning() {
        return running;
    }

    public static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public static boolean canDrawOverlays(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(context);
    }

    public static void start(Context context) {
        Context app = context.getApplicationContext();
        setEnabled(app, true);
        Intent intent = new Intent(app, KoomindBubbleService.class);
        intent.setAction(ACTION_START);
        try {
            ContextCompat.startForegroundService(app, intent);
        } catch (Exception e) {
            Log.e(TAG, "startForegroundService falhou", e);
            try {
                app.startService(intent);
            } catch (Exception e2) {
                Log.e(TAG, "startService falhou", e2);
                setEnabled(app, false);
            }
        }
    }

    public static void stop(Context context) {
        Context app = context.getApplicationContext();
        setEnabled(app, false);
        Intent intent = new Intent(app, KoomindBubbleService.class);
        intent.setAction(ACTION_STOP);
        try {
            app.startService(intent);
        } catch (Exception e) {
            Log.w(TAG, "stop startService", e);
            try {
                app.stopService(new Intent(app, KoomindBubbleService.class));
            } catch (Exception ignored) {
            }
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // Android mata o processo se startForeground não for chamado a tempo.
        try {
            promoteToForeground();
        } catch (Throwable t) {
            Log.e(TAG, "onCreate promoteToForeground", t);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (!foregroundStarted) {
                promoteToForeground();
            }

            String action = intent != null ? intent.getAction() : ACTION_START;
            if (ACTION_STOP.equals(action)) {
                tearDown();
                stopSelf();
                return START_NOT_STICKY;
            }

            if (!canDrawOverlays(this)) {
                Log.w(TAG, "Sem permissão SYSTEM_ALERT_WINDOW");
                setEnabled(this, false);
                toast("Active «Aparecer sobre outros apps» para o SeCretina");
                tearDown();
                stopSelf();
                return START_NOT_STICKY;
            }

            if (bubbleView == null) {
                showBubble();
            }

            if (bubbleView != null) {
                running = true;
                toast("Bolha SeCretina activa");
                return START_STICKY;
            }

            setEnabled(this, false);
            stopSelf();
            return START_NOT_STICKY;
        } catch (Throwable t) {
            Log.e(TAG, "onStartCommand fatal", t);
            setEnabled(this, false);
            running = false;
            try {
                tearDown();
            } catch (Throwable ignored) {
            }
            try {
                stopSelf();
            } catch (Throwable ignored) {
            }
            return START_NOT_STICKY;
        }
    }

    private void promoteToForeground() {
        if (foregroundStarted) return;
        ensureChannel();

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("secretina://assistant"));
        open.setPackage(getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int icon = android.R.drawable.ic_dialog_info;
        try {
            int appIcon = getApplicationInfo().icon;
            if (appIcon != 0) icon = appIcon;
        } catch (Exception ignored) {
        }

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SeCretina")
                .setContentText("Bolha flutuante activa — toque para falar")
                .setSmallIcon(icon)
                .setContentIntent(pi)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        // Usar microphone: já declarado e estável neste APK (specialUse crashava).
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        foregroundStarted = true;
        Log.i(TAG, "Foreground OK");
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Bolha SeCretina",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém a bolha flutuante sobre outros apps");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    private void showBubble() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) {
            throw new IllegalStateException("WindowManager null");
        }

        bubbleSizePx = dp(56);

        bubbleView = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#0F766E"));
        bubbleView.setBackground(bg);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            bubbleView.setElevation(12f);
        }

        TextView label = new TextView(this);
        label.setText("S");
        label.setTextColor(Color.WHITE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setGravity(Gravity.CENTER);
        bubbleView.addView(
                label,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        layoutParams = new WindowManager.LayoutParams(
                bubbleSizePx,
                bubbleSizePx,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;

        SharedPreferences p = prefs(this);
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int defaultX = Math.max(0, metrics.widthPixels - bubbleSizePx - dp(16));
        int defaultY = Math.max(dp(80), metrics.heightPixels / 3);
        layoutParams.x = p.getInt(KEY_X, defaultX);
        layoutParams.y = p.getInt(KEY_Y, defaultY);

        bubbleView.setOnTouchListener(this::onBubbleTouch);
        windowManager.addView(bubbleView, layoutParams);
        Log.i(TAG, "Bolha adicionada x=" + layoutParams.x + " y=" + layoutParams.y);
    }

    private boolean onBubbleTouch(View v, MotionEvent event) {
        if (layoutParams == null || windowManager == null) return false;
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downX = layoutParams.x;
                downY = layoutParams.y;
                moved = false;
                return true;
            case MotionEvent.ACTION_MOVE: {
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    moved = true;
                }
                layoutParams.x = downX + (int) dx;
                layoutParams.y = downY + (int) dy;
                try {
                    windowManager.updateViewLayout(bubbleView, layoutParams);
                } catch (Exception e) {
                    Log.w(TAG, "updateViewLayout", e);
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (!moved) {
                    openAssistant();
                } else {
                    prefs(this)
                            .edit()
                            .putInt(KEY_X, layoutParams.x)
                            .putInt(KEY_Y, layoutParams.y)
                            .apply();
                }
                return true;
            default:
                return false;
        }
    }

    private void openAssistant() {
        try {
            String pkg = getPackageName();
            Uri uri = Uri.parse("secretina://assistant");
            Intent direct = new Intent(Intent.ACTION_VIEW, uri);
            direct.setPackage(pkg);
            direct.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            startActivity(direct);
            Log.i(TAG, "Abriu secretina://assistant");
        } catch (Exception e) {
            Log.w(TAG, "Falha deep link, launcher", e);
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (launch != null) {
                    launch.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK
                                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    );
                    launch.setData(Uri.parse("secretina://assistant"));
                    startActivity(launch);
                }
            } catch (Exception e2) {
                Log.e(TAG, "Falha ao abrir app", e2);
            }
        }
    }

    private void toast(String msg) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
        });
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        );
    }

    private void tearDown() {
        running = false;
        if (windowManager != null && bubbleView != null) {
            try {
                windowManager.removeView(bubbleView);
            } catch (Exception e) {
                Log.w(TAG, "removeView", e);
            }
        }
        bubbleView = null;
        windowManager = null;
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception e) {
            try {
                stopForeground(true);
            } catch (Exception ignored) {
            }
        }
        foregroundStarted = false;
    }

    @Override
    public void onDestroy() {
        try {
            tearDown();
        } catch (Throwable t) {
            Log.w(TAG, "onDestroy", t);
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
