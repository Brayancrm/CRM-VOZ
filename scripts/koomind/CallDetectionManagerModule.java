package com.pritesh.calldetection;

import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.media.MediaPlayer;
import android.os.PowerManager;
import android.provider.Settings;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.util.HashMap;
import java.util.Map;

/**
 * KooMind — detecção de chamada + gravação nativa em foreground service.
 */
public class CallDetectionManagerModule
        extends ReactContextBaseJavaModule
        implements Application.ActivityLifecycleCallbacks,
        CallDetectionPhoneStateListener.PhoneCallStateUpdate {

    private static final String TAG = "KooMindCall";
    private static final String EVENT_PHONE_STATE = "KooMindPhoneCallState";
    private static CallDetectionManagerModule instance;
    /** Evita Disconnected duplicado (monitor nativo já emite com sessionId). */
    private static volatile long lastNativeDisconnectedAt = 0;

    /** Emite evento de linha ao JS (ex.: após encerrar gravação no serviço nativo). */
    public static void emitPhoneStateFromNative(String state, String phoneNumber) {
        emitPhoneStateFromNative(state, phoneNumber, null);
    }

    public static void emitPhoneStateFromNative(
            String state,
            String phoneNumber,
            String sessionId
    ) {
        CallDetectionManagerModule mod = instance;
        if (mod == null) return;
        if ("Disconnected".equals(state) && sessionId != null && !sessionId.isEmpty()) {
            lastNativeDisconnectedAt = System.currentTimeMillis();
        }
        mod.emitCallState(state, phoneNumber, sessionId);
    }

    private boolean wasAppInOffHook = false;
    private boolean wasAppInRinging = false;
    private final ReactApplicationContext reactContext;
    private TelephonyManager telephonyManager;
    private CallDetectionPhoneStateListener callDetectionPhoneStateListener;
    private Activity activity = null;
    private MediaPlayer localAudioPlayer;

    public CallDetectionManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        instance = this;
        KoomindAppContext.init(reactContext);
    }

    @Override
    public String getName() {
        return "CallDetectionManagerAndroid";
    }

    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(int count) {
    }

    @ReactMethod
    public void getLastCallNumber(Promise promise) {
        try {
            String number = KoomindCallLogHelper.resolveRecentCallNumber(reactContext);
            promise.resolve(number != null ? number : "");
        } catch (Exception e) {
            promise.reject("CALL_LOG", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getNativeCallRecordingState(Promise promise) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("recording", KoomindCallRecordingStore.isRecording());
        String sessionId = KoomindCallRecordingStore.getActiveSessionId();
        map.putString("sessionId", sessionId != null ? sessionId : "");
        String phone = KoomindCallRecordingStore.getActivePhone();
        map.putString("phone", phone != null ? phone : "");
        map.putDouble("startedAt", KoomindCallRecordingStore.getActiveStartedAt());
        promise.resolve(map);
    }

    @ReactMethod
    public void consumeNativeCallRecording(Promise promise) {
        KoomindCallRecordingStore.FinishedCall finished =
                KoomindCallRecordingStore.consumePending();
        if (finished == null) {
            promise.resolve(null);
            return;
        }
        WritableMap map = Arguments.createMap();
        map.putString("sessionId", finished.sessionId);
        map.putString("phone", finished.phone);
        map.putString("audioPath", finished.audioPath != null ? finished.audioPath : "");
        map.putDouble("startedAt", finished.startedAt);
        map.putDouble("endedAt", finished.endedAt);
        map.putDouble("fileSizeBytes", finished.fileSizeBytes);
        if (finished.audioPath != null && finished.audioPath.length() > 0) {
            map.putString("audioUri", Uri.fromFile(new java.io.File(finished.audioPath)).toString());
        } else {
            map.putString("audioUri", "");
        }
        promise.resolve(map);
    }

    @ReactMethod
    public void getRecordingLastError(Promise promise) {
        promise.resolve(KoomindCallRecordingStore.getLastError());
    }

    @ReactMethod
    public void getRecordingDiagnostics(Promise promise) {
        promise.resolve(KoomindCallRecordingStore.getLastRecordingDiagnostics());
    }

    @ReactMethod
    public void getHelperStatus(Promise promise) {
        WritableMap map = Arguments.createMap();
        boolean connector = KoomindHelperBridge.isConnectorEnabled(reactContext);
        boolean installed = KoomindHelperBridge.isHelperInstalled(reactContext);
        map.putBoolean("installed", installed || connector);
        map.putBoolean("connectorEnabled", connector);
        map.putBoolean("packageVisible", installed);
        promise.resolve(map);
    }

    @ReactMethod
    public void openHelperAccessibilitySettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("HELPER", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void openHelperAppDetails(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + KoomindHelperBridge.HELPER_PACKAGE));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("HELPER", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void canDrawOverlays(Promise promise) {
        promise.resolve(KoomindBubbleService.canDrawOverlays(reactContext));
    }

    @ReactMethod
    public void openOverlayPermissionSettings(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + reactContext.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OVERLAY", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void startSecretinaBubble(Promise promise) {
        try {
            if (!KoomindBubbleService.canDrawOverlays(reactContext)) {
                promise.reject(
                        "OVERLAY",
                        "Permita «Aparecer sobre outros apps» nas definições do sistema."
                );
                return;
            }
            // FGS tipo microphone exige RECORD_AUDIO no Android 14+.
            if (Build.VERSION.SDK_INT >= 34) {
                int mic = ContextCompat.checkSelfPermission(
                        reactContext,
                        Manifest.permission.RECORD_AUDIO
                );
                if (mic != PackageManager.PERMISSION_GRANTED) {
                    promise.reject(
                            "MIC",
                            "Permita o microfone ao SeCretina e tente activar a bolha de novo."
                    );
                    return;
                }
            }
            KoomindBubbleService.start(reactContext);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("BUBBLE", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopSecretinaBubble(Promise promise) {
        try {
            KoomindBubbleService.stop(reactContext);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("BUBBLE", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void isSecretinaBubbleRunning(Promise promise) {
        promise.resolve(KoomindBubbleService.isRunning());
    }

    @ReactMethod
    public void isSecretinaBubbleEnabled(Promise promise) {
        promise.resolve(KoomindBubbleService.isEnabled(reactContext));
    }

    @ReactMethod
    public void abandonNativeRecording(Promise promise) {
        try {
            KoomindCallMonitorService.abandonActiveRecording(reactContext);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ABANDON", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void updateRecordingDisplayName(String displayName) {
        /* notificação atualizada pelo monitor unificado */
    }

    /** Traz o app para frente (pós-chamada / notificação). */
    @ReactMethod
    public void bringAppToForeground() {
        bringAppToForeground(reactContext);
    }

    /** Abre a tela pós-chamada via deep link — funciona com app em segundo plano. */
    public static void openPostCallAfterCallEnded(Context context, String sessionId) {
        launchPostCallScreen(context, sessionId);
    }

    public static PendingIntent createPostCallPendingIntent(
            Context context,
            String sessionId,
            int requestCode
    ) {
        Context app = context.getApplicationContext();
        Intent launch = new Intent(app, KoomindPostCallLaunchActivity.class);
        launch.putExtra(KoomindPostCallLaunchActivity.EXTRA_SESSION_ID, sessionId != null ? sessionId : "");
        launch.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        return PendingIntent.getActivity(
                app,
                requestCode,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** Abre pós-chamada a partir do FGS / notificação (Android 12+). */
    public static void launchPostCallScreen(Context context, String sessionId) {
        if (context == null || sessionId == null || sessionId.isEmpty()) {
            return;
        }
        Context app = context.getApplicationContext();
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> launchPostCallScreenOnMain(app, sessionId));
    }

    private static void launchPostCallScreenOnMain(Context app, String sessionId) {
        wakeScreenBriefly(app);
        try {
            String pkg = app.getPackageName();
            Uri uri = Uri.parse("secretina://post-call/" + Uri.encode(sessionId));
            Intent direct = new Intent(Intent.ACTION_VIEW, uri);
            direct.setClassName(pkg, pkg + ".MainActivity");
            direct.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            app.startActivity(direct);
            Log.i(TAG, "launchPostCall MainActivity session=" + sessionId);
            return;
        } catch (Exception e) {
            Log.w(TAG, "launchPostCall MainActivity", e);
        }
        try {
            PendingIntent pending = createPostCallPendingIntent(
                    app,
                    sessionId,
                    sessionId.hashCode() & 0xFFFF
            );
            pending.send();
            Log.i(TAG, "launchPostCall PendingIntent session=" + sessionId);
            return;
        } catch (Exception e) {
            Log.w(TAG, "launchPostCall pending", e);
        }
        try {
            Intent launch = new Intent(app, KoomindPostCallLaunchActivity.class);
            launch.putExtra(KoomindPostCallLaunchActivity.EXTRA_SESSION_ID, sessionId);
            launch.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            app.startActivity(launch);
            Log.i(TAG, "launchPostCall activity session=" + sessionId);
        } catch (Exception e) {
            Log.w(TAG, "launchPostCall activity", e);
            bringAppToForeground(app);
        }
    }

    private static void wakeScreenBriefly(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                            | PowerManager.ACQUIRE_CAUSES_WAKEUP
                            | PowerManager.ON_AFTER_RELEASE,
                    "KooMind:PostCallWake"
            );
            wl.acquire(3000L);
        } catch (Exception e) {
            Log.w(TAG, "wakeScreen", e);
        }
    }

    public static void bringAppToForeground(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        try {
            Intent launch = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
            if (launch == null) return;
            launch.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            app.startActivity(launch);
        } catch (Exception e) {
            Log.w(TAG, "bringAppToForeground", e);
        }
    }

    /** Igual apps ACR (Talker): bateria sem otimização para gravar com app fechado. */
    @ReactMethod
    public void isIgnoringBatteryOptimizations(Promise promise) {
        try {
            PowerManager pm = (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);
            if (pm == null) {
                promise.resolve(false);
                return;
            }
            promise.resolve(pm.isIgnoringBatteryOptimizations(reactContext.getPackageName()));
        } catch (Exception e) {
            promise.reject("BATTERY", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void requestIgnoreBatteryOptimizations(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + reactContext.getPackageName()));
            Activity current = getCurrentActivity();
            if (current != null) {
                current.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("BATTERY", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void openBatteryOptimizationSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("BATTERY", e.getMessage(), e);
        }
    }

    private void emitCallState(String state, String phoneNumber) {
        emitCallState(state, phoneNumber, null);
    }

    private void emitCallState(String state, String phoneNumber, String sessionId) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("state", state);
            params.putString("phoneNumber", phoneNumber != null ? phoneNumber : "");
            if (sessionId != null && !sessionId.isEmpty()) {
                params.putString("sessionId", sessionId);
            }
            reactContext.emitDeviceEvent(EVENT_PHONE_STATE, params);
            Log.d(TAG, "emit " + state + " phone=" + phoneNumber + " session=" + sessionId);
        } catch (Exception e) {
            Log.w(TAG, "emitCallState failed", e);
        }
    }

    private String enrichPhoneNumber(String phoneNumber) {
        return KoomindCallLogHelper.enrichPhone(reactContext, phoneNumber);
    }

    @ReactMethod
    public void startListener() {
        if (activity == null) {
            activity = getCurrentActivity();
            if (activity != null) {
                activity.getApplication().registerActivityLifecycleCallbacks(this);
            }
        }

        if (reactContext.checkSelfPermission(Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_PHONE_STATE not granted");
            return;
        }

        KoomindCallMonitorService.start(reactContext);
        telephonyManager = (TelephonyManager) reactContext.getSystemService(Context.TELEPHONY_SERVICE);
        if (telephonyManager == null) {
            return;
        }

        if (callDetectionPhoneStateListener != null) {
            telephonyManager.listen(callDetectionPhoneStateListener, PhoneStateListener.LISTEN_NONE);
        }

        callDetectionPhoneStateListener = new CallDetectionPhoneStateListener(this);
        telephonyManager.listen(
                callDetectionPhoneStateListener,
                PhoneStateListener.LISTEN_CALL_STATE
        );
        Log.d(TAG, "monitor service started");
    }

    @ReactMethod
    public void stopJsListener() {
        if (telephonyManager != null && callDetectionPhoneStateListener != null) {
            telephonyManager.listen(callDetectionPhoneStateListener, PhoneStateListener.LISTEN_NONE);
            callDetectionPhoneStateListener = null;
        }
        telephonyManager = null;
        Log.d(TAG, "JS listener removido — monitor nativo continua");
    }

    @ReactMethod
    public void stopListener() {
        stopJsListener();
        KoomindCallMonitorService.stop(reactContext);
    }

    /** Reproduz WAV/M4A local via MediaPlayer (fallback quando expo-av falha). */
    @ReactMethod
    public void playLocalAudioFile(final String uriOrPath, final Promise promise) {
        final Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
            try {
                releaseLocalAudioPlayer();
                String path = uriOrPath != null ? uriOrPath.trim() : "";
                if (path.isEmpty()) {
                    promise.reject("PLAYBACK", "Caminho de áudio vazio");
                    return;
                }
                if (path.startsWith("file://")) {
                    path = path.substring(7);
                }
                localAudioPlayer = new MediaPlayer();
                localAudioPlayer.setDataSource(path);
                localAudioPlayer.setOnCompletionListener(mp -> {
                    releaseLocalAudioPlayer();
                    promise.resolve(true);
                });
                localAudioPlayer.setOnErrorListener((mp, what, extra) -> {
                    releaseLocalAudioPlayer();
                    promise.reject("PLAYBACK", "Erro ao reproduzir (" + what + ")");
                    return true;
                });
                localAudioPlayer.prepare();
                localAudioPlayer.start();
            } catch (Exception e) {
                releaseLocalAudioPlayer();
                promise.reject("PLAYBACK", e.getMessage(), e);
            }
        });
    }

    @ReactMethod
    public void stopLocalAudioPlayback(final Promise promise) {
        new Handler(Looper.getMainLooper()).post(() -> {
            releaseLocalAudioPlayer();
            promise.resolve(true);
        });
    }

    private void releaseLocalAudioPlayer() {
        if (localAudioPlayer == null) return;
        try {
            if (localAudioPlayer.isPlaying()) {
                localAudioPlayer.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            localAudioPlayer.release();
        } catch (Exception ignored) {
        }
        localAudioPlayer = null;
    }

    @NonNull
    @Override
    public Map<String, Object> getConstants() {
        Map<String, Object> map = new HashMap<>();
        map.put("Incoming", "Incoming");
        map.put("Offhook", "Offhook");
        map.put("Disconnected", "Disconnected");
        map.put("Missed", "Missed");
        return map;
    }

    @Override
    public void phoneCallStateUpdated(int state, String phoneNumber) {
        String phone = enrichPhoneNumber(phoneNumber);

        switch (state) {
            case TelephonyManager.CALL_STATE_IDLE:
                if (wasAppInOffHook) {
                    long sinceNative = System.currentTimeMillis() - lastNativeDisconnectedAt;
                    boolean monitorHandled = KoomindCallRecordingStore.isRecording()
                            || sinceNative < 15_000;
                    if (!monitorHandled) {
                        emitCallState("Disconnected", phone);
                    }
                } else if (wasAppInRinging) {
                    emitCallState("Missed", phone);
                }
                wasAppInRinging = false;
                wasAppInOffHook = false;
                break;
            case TelephonyManager.CALL_STATE_OFFHOOK:
                wasAppInOffHook = true;
                emitCallState("Offhook", phone);
                break;
            case TelephonyManager.CALL_STATE_RINGING:
                wasAppInRinging = true;
                emitCallState("Incoming", phone);
                break;
            default:
                break;
        }
    }

    @Override
    public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
    }

    @Override
    public void onActivityStarted(Activity activity) {
    }

    @Override
    public void onActivityResumed(Activity activity) {
    }

    @Override
    public void onActivityPaused(Activity activity) {
    }

    @Override
    public void onActivityStopped(Activity activity) {
    }

    @Override
    public void onActivitySaveInstanceState(Activity activity, Bundle outState) {
    }

    @Override
    public void onActivityDestroyed(Activity activity) {
    }
}
