package com.pritesh.calldetection;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.util.UUID;

/**
 * Detecção + gravação VAD (AudioRecord + buffer circular) em foreground service.
 */
public class KoomindCallMonitorService extends Service
        implements CallDetectionPhoneStateListener.PhoneCallStateUpdate {

    private static final String TAG = "KooMindMonitor";
    public static final String ACTION_START = "com.koomind.action.START_MONITOR";
    public static final String ACTION_STOP = "com.koomind.action.STOP_MONITOR";
    public static final String ACTION_CALL_OFFHOOK = "com.koomind.action.CALL_OFFHOOK";
    public static final String ACTION_ABANDON_RECORDING = "com.koomind.action.ABANDON_RECORDING";
    public static final String ACTION_CALL_ENDED = "com.koomind.action.CALL_ENDED";
    private static final String EXTRA_PHONE = "phone";
    private static final String EXTRA_FROM_HELPER = "from_helper";
    private static final String EXTRA_SESSION_ID = "sessionId";
    public static final String ACTION_HELPER_RECORDING = "com.koomind.action.HELPER_RECORDING";

    private static final String CHANNEL_ID = "gravacao-chamada";
    private static final String CHANNEL_POST_CALL = "pos-chamada";
    private static final int NOTIFICATION_ID = 41000;
    /** ~0,06 s PCM mono 16 kHz — aceita ligações curtas */
    private static final long MIN_PCM_BYTES = 2_000;
    /** RMS mínimo — abaixo disto o PCM é silêncio digital (Samsung GSM). */
    private static final double MIN_SPEECH_RMS = 80.0;
    /** Tentativas de esperar WAV do Helper (~45 s após delay inicial). */
    private static final int HELPER_FINALIZE_MAX_ATTEMPTS = 75;
    private static final int HELPER_FINALIZE_POLL_MS = 400;
    /** Espera inicial após desligar antes de pedir WAV ao Helper. */
    private static final int HELPER_FINALIZE_INITIAL_MS = 900;
    /** Aguardar HAL Samsung após OFFHOOK antes de abrir o microfone. */
    /** HALT antes de tocar no AudioManager (janela VOICE_CALL no Samsung). */
    private static final int DELAY_OFFHOOK_MS = 2500;
    /** Com Helper activo o conector já sincronizou com a UI da chamada. */
    private static final int DELAY_OFFHOOK_HELPER_MS = 400;

    private TelephonyManager telephonyManager;
    private CallDetectionPhoneStateListener phoneStateListener;
    private boolean wasOffHook = false;
    private boolean wasRinging = false;

    private KoomindVadAudioRecorder vadRecorder;
    private String recordingSessionId;
    private String recordingPhone;
    private String recordingPath;
    private boolean helperDelegated;
    private double helperMaxRms;
    private PowerManager.WakeLock wakeLock;

    private static final class HelperPendingRecording {
        final String sessionId;
        final String phone;
        final String path;
        final double maxRms;
        final String diagnostics;

        HelperPendingRecording(
                String sessionId,
                String phone,
                String path,
                double maxRms,
                String diagnostics
        ) {
            this.sessionId = sessionId;
            this.phone = phone;
            this.path = path;
            this.maxRms = maxRms;
            this.diagnostics = diagnostics;
        }
    }

    private static volatile HelperPendingRecording pendingHelperRecording;
    private static volatile boolean helperFinalizeComplete = false;
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static volatile Runnable helperFinalizeRunnable;

    private static void cancelHelperFinalizeCallbacks() {
        if (helperFinalizeRunnable != null) {
            MAIN_HANDLER.removeCallbacks(helperFinalizeRunnable);
            helperFinalizeRunnable = null;
        }
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, KoomindCallMonitorService.class);
        intent.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, KoomindCallMonitorService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    public static void abandonActiveRecording(Context context) {
        Intent intent = new Intent(context, KoomindCallMonitorService.class);
        intent.setAction(ACTION_ABANDON_RECORDING);
        context.startService(intent);
    }

    public static void notifyOffhook(Context context, String phone) {
        notifyOffhookInternal(context, phone, false, "");
    }

    public static void notifyOffhookFromHelper(Context context, String phone, String sessionId) {
        notifyOffhookInternal(context, phone, true, sessionId);
    }

    private static void notifyOffhookInternal(
            Context context,
            String phone,
            boolean fromHelper,
            String sessionId
    ) {
        Intent intent = new Intent(context, KoomindCallMonitorService.class);
        intent.setAction(ACTION_CALL_OFFHOOK);
        intent.putExtra(EXTRA_PHONE, phone != null ? phone : "");
        intent.putExtra(EXTRA_FROM_HELPER, fromHelper);
        intent.putExtra(EXTRA_SESSION_ID, sessionId != null ? sessionId : "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    public static void applyHelperRecording(
            Context context,
            String sessionId,
            String phone,
            Uri audioUri,
            String diagnostics,
            double maxRms
    ) {
        if (context == null || sessionId == null || sessionId.isEmpty()) return;
        cancelHelperFinalizeCallbacks();
        File dir = new File(context.getApplicationContext().getFilesDir(), "koomind_recordings");
        if (!dir.exists()) dir.mkdirs();
        File dest = new File(dir, sessionId + ".wav");
        boolean copied = audioUri != null && KoomindHelperBridge.copyHelperAudioToFile(context, audioUri, dest);
        if (!copied && audioUri != null) {
            copied = KoomindHelperBridge.copyHelperAudioToFile(
                    context.getApplicationContext(), audioUri, dest);
        }
        String path = copied ? dest.getAbsolutePath() : "";
        pendingHelperRecording = new HelperPendingRecording(
                sessionId,
                phone != null ? phone : "",
                path,
                maxRms,
                diagnostics != null ? diagnostics : ""
        );
        KoomindCallRecordingStore.setLastRecordingDiagnostics(
                diagnostics != null ? diagnostics : ""
        );
        if (maxRms >= MIN_SPEECH_RMS && copied) {
            KoomindCallRecordingStore.setLastError("");
        }
        Log.i(TAG, "Helper WAV recebido session=" + sessionId + " maxRms=" + maxRms + " copied=" + copied
                + " finalized=" + helperFinalizeComplete);

        Context app = context.getApplicationContext();
        Intent intent = new Intent(app, KoomindCallMonitorService.class);
        intent.setAction(ACTION_HELPER_RECORDING);
        intent.putExtra(EXTRA_SESSION_ID, sessionId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(app, intent);
        } else {
            app.startService(intent);
        }
    }

    /** BroadcastReceiver / sistema — encerra gravação sem depender do JS. */
    public static void notifyCallEnded(Context context) {
        Intent intent = new Intent(context, KoomindCallMonitorService.class);
        intent.setAction(ACTION_CALL_ENDED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CALL_OFFHOOK.equals(intent.getAction())) {
            startMonitor();
            final String phone = intent.getStringExtra(EXTRA_PHONE);
            final boolean fromHelper = intent.getBooleanExtra(EXTRA_FROM_HELPER, false);
            final String sessionId = intent.getStringExtra(EXTRA_SESSION_ID);
            if (fromHelper) {
                KoomindHelperBridge.markHelperCallStarted(this);
            }
            if (fromHelper && KoomindHelperBridge.isConnectorEnabled(this)) {
                // Helper deixou de gravar — só rastreia a ligação para abrir nota.
                trackActiveCall(phone != null ? phone : "", sessionId);
            } else {
                scheduleOffhookRecording(phone != null ? phone : "", fromHelper);
            }
            return START_STICKY;
        }
        if (intent != null && ACTION_HELPER_RECORDING.equals(intent.getAction())) {
            startMonitor();
            final String sessionId = intent.getStringExtra(EXTRA_SESSION_ID);
            if (pendingHelperRecording != null) {
                final boolean lateRecovery = helperFinalizeComplete;
                new Handler(Looper.getMainLooper()).post(
                        () -> finalizeHelperRecording(
                                sessionId != null ? sessionId : "",
                                pendingHelperRecording.phone,
                                0,
                                lateRecovery
                        )
                );
            }
            return START_STICKY;
        }
        if (intent != null && ACTION_CALL_ENDED.equals(intent.getAction())) {
            startMonitor();
            new Handler(Looper.getMainLooper()).postDelayed(
                    () -> stopCallRecording(false),
                    1800
            );
            return START_STICKY;
        }
        if (intent != null && ACTION_ABANDON_RECORDING.equals(intent.getAction())) {
            stopCallRecording(true);
            return START_STICKY;
        }
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopCallRecording(true);
            stopMonitor();
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        startMonitor();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.w(TAG, "task removed — religando monitor");
        start(this);
        super.onTaskRemoved(rootIntent);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "KooMind:CallRecording"
        );
        wakeLock.acquire(60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void startMonitor() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "sem READ_PHONE_STATE");
            return;
        }

        showNotification("SeCretina — detecção ativa",
                "Mantenha esta notificação. Ao terminar a ligação, abre a nota do contato.");

        telephonyManager = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (telephonyManager == null) return;

        if (phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        }
        phoneStateListener = new CallDetectionPhoneStateListener(this);
        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        Log.d(TAG, "monitor ativo");
    }

    private void stopMonitor() {
        if (telephonyManager != null && phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        }
        phoneStateListener = null;
        telephonyManager = null;
    }

    @Override
    public void phoneCallStateUpdated(int state, String phoneNumber) {
        String phone = phoneNumber != null ? phoneNumber.trim() : "";

        switch (state) {
            case TelephonyManager.CALL_STATE_RINGING:
                wasRinging = true;
                break;
            case TelephonyManager.CALL_STATE_OFFHOOK:
                wasOffHook = true;
                wasRinging = false;
                if (KoomindHelperBridge.isConnectorEnabled(this)) {
                    startHelperDelegatedSession(phone, "");
                } else {
                    scheduleOffhookRecording(phone, false);
                }
                break;
            case TelephonyManager.CALL_STATE_IDLE:
                if (wasOffHook) {
                    KoomindHelperBridge.markHelperCallEnded();
                    new Handler(Looper.getMainLooper()).postDelayed(
                            () -> stopCallRecording(false),
                            800
                    );
                }
                wasOffHook = false;
                wasRinging = false;
        showNotification("SeCretina — detecção ativa",
                "Pronto para a próxima ligação.");
                break;
            default:
                break;
        }
    }

    private void startHelperDelegatedSession(String phone, String sessionId) {
        if (recordingSessionId != null && helperDelegated) {
            if (sessionId != null && !sessionId.isEmpty()) {
                syncHelperSessionId(sessionId);
            }
            return;
        }
        helperDelegated = true;
        helperFinalizeComplete = false;
        recordingSessionId = sessionId != null && !sessionId.isEmpty()
                ? sessionId
                : UUID.randomUUID().toString();
        recordingPhone = KoomindCallLogHelper.enrichPhone(this, phone != null ? phone : "");
        recordingPath = new File(
                new File(getFilesDir(), "koomind_recordings"),
                recordingSessionId + ".wav"
        ).getAbsolutePath();
        KoomindCallRecordingStore.startSession(recordingSessionId, recordingPhone);
        acquireWakeLock();
        String label = recordingPhone.isEmpty() ? "ligação" : recordingPhone;
        showNotification(
                "SeCretina — em ligação",
                "Com " + label + ". Ao desligar, abre a nota."
        );
        Log.i(TAG, "Sessão delegada ao Helper " + recordingSessionId);
    }

    private void syncHelperSessionId(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return;
        if (sessionId.equals(recordingSessionId)) return;
        Log.i(TAG, "Sincronizar sessionId Helper " + recordingSessionId + " → " + sessionId);
        recordingSessionId = sessionId;
        recordingPath = new File(
                new File(getFilesDir(), "koomind_recordings"),
                sessionId + ".wav"
        ).getAbsolutePath();
        KoomindCallRecordingStore.syncActiveSessionId(sessionId);
    }

    private void scheduleOffhookRecording(String phone, boolean preferHelperDelay) {
        int delay = preferHelperDelay || KoomindHelperBridge.isConnectorEnabled(this)
                ? DELAY_OFFHOOK_HELPER_MS
                : DELAY_OFFHOOK_MS;
        Log.i(TAG, "OFFHOOK → rastrear ligação (sem gravação) delay=" + delay + "ms");
        new Handler(Looper.getMainLooper()).postDelayed(
                () -> trackActiveCall(phone, ""),
                delay
        );
    }

    /** Identifica a ligação e prepara sessão — sem gravar áudio. */
    private void trackActiveCall(String phone, String preferredSessionId) {
        if (recordingSessionId != null) return;

        recordingSessionId = preferredSessionId != null && !preferredSessionId.isEmpty()
                ? preferredSessionId
                : UUID.randomUUID().toString();
        recordingPhone = KoomindCallLogHelper.enrichPhone(this, phone != null ? phone : "");
        KoomindCallRecordingStore.startSession(recordingSessionId, recordingPhone);
        recordingPath = null;
        vadRecorder = null;
        helperDelegated = false;

        acquireWakeLock();
        String label = recordingPhone.isEmpty() ? "ligação" : recordingPhone;
        showNotification(
                "SeCretina — em ligação",
                "Com " + label + ". Ao desligar, abre a nota."
        );
        Log.i(TAG, "Sessão rastreada (sem áudio) " + recordingSessionId);
    }

    private void startCallRecording(String phone) {
        // Mantido por compatibilidade — gravação desativada.
        trackActiveCall(phone, "");
    }

    private void restoreAudioMode() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception e) {
            Log.w(TAG, "restore audio", e);
        }
    }

    private void stopCallRecording(boolean abandon) {
        releaseWakeLock();

        final boolean delegated = helperDelegated;
        helperDelegated = false;

        if (vadRecorder == null && recordingSessionId == null && !delegated) return;

        final String sid = recordingSessionId;
        final String phone = recordingPhone;
        final String path = recordingPath;
        final KoomindVadAudioRecorder recorder = vadRecorder;

        vadRecorder = null;
        recordingSessionId = null;
        recordingPhone = null;
        recordingPath = null;

        if (recorder != null) {
            boolean savedSuccessfully = false;
            String diagnostics = "";
            if (abandon) {
                recorder.abandon();
            } else {
                savedSuccessfully = recorder.stopAndFinalize();
            }
            diagnostics = recorder.getDiagnosticsSummary();
            KoomindCallRecordingStore.setLastRecordingDiagnostics(diagnostics);

            if (abandon) {
                if (path != null) new File(path).delete();
                KoomindCallRecordingStore.cancelActiveSession();
                KoomindCallRecordingStore.clearPending();
                return;
            }

            final boolean wavSaved = savedSuccessfully;
            final double maxRms = recorder.getMaxRmsSeen();
            new Handler(Looper.getMainLooper()).postDelayed(
                    () -> finalizeStoppedRecording(sid, phone, path, wavSaved, maxRms, false),
                    400
            );
            return;
        }

        if (delegated) {
            KoomindHelperBridge.markHelperCallEnded();
            if (abandon) {
                cancelHelperFinalizeCallbacks();
                pendingHelperRecording = null;
                KoomindCallRecordingStore.cancelActiveSession();
                KoomindCallRecordingStore.clearPending();
                return;
            }
            cancelHelperFinalizeCallbacks();
            final String finalizeSid = sid;
            final String finalizePhone = phone;
            helperFinalizeRunnable = () -> finalizeHelperRecording(finalizeSid, finalizePhone, 0, false);
            MAIN_HANDLER.postDelayed(helperFinalizeRunnable, HELPER_FINALIZE_INITIAL_MS);
            return;
        }

        // Sem gravação: só abre pós-chamada com a sessão rastreada.
        if (sid != null && !abandon) {
            KoomindCallRecordingStore.finishSessionWithoutAudio(
                    sid, phone != null ? phone : "", System.currentTimeMillis());
            resetForegroundAfterCall();
            CallDetectionManagerModule.launchPostCallScreen(this, sid);
            CallDetectionManagerModule.emitPhoneStateFromNative(
                    "Disconnected",
                    phone != null ? phone : "",
                    sid
            );
        } else if (abandon && sid != null) {
            KoomindCallRecordingStore.cancelActiveSession();
            KoomindCallRecordingStore.clearPending();
        }

        restoreAudioMode();
    }

    private void finalizeHelperRecording(
            String expectedSid,
            String phone,
            int attempt,
            boolean lateRecovery
    ) {
        HelperPendingRecording pending = pendingHelperRecording;
        if (pending != null) {
            cancelHelperFinalizeCallbacks();
            pendingHelperRecording = null;
            if (pending.diagnostics != null && !pending.diagnostics.isEmpty()) {
                KoomindCallRecordingStore.setLastRecordingDiagnostics(pending.diagnostics);
            }
            boolean wavOk = pending.path != null
                    && !pending.path.isEmpty()
                    && new File(pending.path).exists();
            if (lateRecovery && helperFinalizeComplete && wavOk && pending.maxRms >= MIN_SPEECH_RMS) {
                Log.i(TAG, "Recuperação tardia Helper WAV session=" + pending.sessionId);
            }
            finalizeStoppedRecording(
                    pending.sessionId,
                    pending.phone != null && !pending.phone.isEmpty() ? pending.phone : phone,
                    pending.path,
                    wavOk,
                    pending.maxRms,
                    false
            );
            return;
        }
        if (attempt < HELPER_FINALIZE_MAX_ATTEMPTS) {
            final int next = attempt + 1;
            helperFinalizeRunnable = () -> finalizeHelperRecording(expectedSid, phone, next, false);
            MAIN_HANDLER.postDelayed(helperFinalizeRunnable, HELPER_FINALIZE_POLL_MS);
            return;
        }
        cancelHelperFinalizeCallbacks();
        if (expectedSid != null && !expectedSid.isEmpty()) {
            File recovered = new File(
                    getFilesDir(),
                    "koomind_recordings/" + expectedSid + ".wav"
            );
            if (recovered.exists() && recovered.length() >= MIN_PCM_BYTES) {
                String diag = KoomindCallRecordingStore.getLastRecordingDiagnostics();
                double diagRms = parseDiagMaxRms(diag);
                Log.i(TAG, "Recuperação WAV em disco session=" + expectedSid);
                finalizeStoppedRecording(
                        expectedSid,
                        phone,
                        recovered.getAbsolutePath(),
                        true,
                        diagRms > 0 ? diagRms : MIN_SPEECH_RMS,
                        false
                );
                return;
            }
            String diag = KoomindCallRecordingStore.getLastRecordingDiagnostics();
            double diagRms = parseDiagMaxRms(diag);
            if (diagRms >= MIN_SPEECH_RMS) {
                Log.w(TAG, "Helper áudio OK no diag mas WAV pendente maxRms=" + diagRms);
                KoomindCallRecordingStore.setLastError(
                        "Áudio captado — abra o KooMind para concluir a nota.");
            } else if (diag != null && diag.contains("HELPER_PROC") && diag.contains("pcm=")) {
                KoomindCallRecordingStore.setLastError(
                        "Samsung bloqueou microfone na GSM (Helper) — use viva-voz alto e fale direto ao telefone.");
            } else {
                KoomindCallRecordingStore.setLastError(
                        "Helper não entregou áudio a tempo — abra o KooMind ou tente de novo.");
            }
            finalizeStoppedRecording(expectedSid, phone, "", false, diagRms, true);
        }
    }

    private static double parseDiagMaxRms(String diag) {
        if (diag == null || !diag.contains("maxRms=")) return 0;
        try {
            int i = diag.indexOf("maxRms=");
            int end = diag.indexOf(' ', i);
            String num = end > i ? diag.substring(i + 7, end) : diag.substring(i + 7);
            return Double.parseDouble(num.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private void finalizeStoppedRecording(
            String sid,
            String phone,
            String path,
            boolean wavOk,
            double maxRms,
            boolean keepLastError
    ) {
        if (sid == null) return;

        String phoneResolved = KoomindCallLogHelper.enrichPhone(
                this,
                phone != null ? phone : recordingPhone
        );
        if (phoneResolved != null && phoneResolved.length() >= 7) {
            phone = phoneResolved;
        }

        File f = path != null ? new File(path) : null;
        long size = f != null && f.exists() ? f.length() : 0;
        String diag = KoomindCallRecordingStore.getLastRecordingDiagnostics();
        Log.i(TAG, "DIAGNÓSTICO → " + diag + " wavOk=" + wavOk + " maxRms=" + maxRms);
        if (maxRms >= MIN_SPEECH_RMS) {
            Log.i(TAG, "Áudio real detectado maxRms=" + maxRms);
        } else {
            Log.w(TAG, "Silêncio digital (maxRms=" + maxRms + ") — ver Ajustes");
        }
        Log.d(TAG, "arquivo final " + path + " bytes=" + size);

        boolean hasSpeech = maxRms >= MIN_SPEECH_RMS;
        boolean hasUsableFile = wavOk && f != null && f.exists() && size >= MIN_PCM_BYTES;
        if (hasUsableFile && (hasSpeech || size >= MIN_PCM_BYTES * 4)) {
            KoomindCallRecordingStore.setLastError("");
            KoomindCallRecordingStore.finishSession(
                    sid, phone, path, System.currentTimeMillis(), size);
        } else {
            if (f != null && f.exists()) f.delete();
            KoomindCallRecordingStore.finishSessionWithoutAudio(
                    sid, phone, System.currentTimeMillis());
            if (!keepLastError) {
                if (maxRms < MIN_SPEECH_RMS && size > 0) {
                    if (diag != null && diag.contains("HELPER_PROC")) {
                        KoomindCallRecordingStore.setLastError(
                                "Helper gravou silêncio — abra o Helper e conceda microfone + fale com viva-voz.");
                    } else {
                        KoomindCallRecordingStore.setLastError(
                                "Microfone mudo na ligação (Samsung) — use viva-voz, volume alto e confira bateria sem restrições.");
                    }
                } else {
                    KoomindCallRecordingStore.setLastError(
                            "Sem áudio na ligação — toque para gravar nota de voz.");
                }
            }
        }
        resetForegroundAfterCall();
        CallDetectionManagerModule.launchPostCallScreen(this, sid);
        CallDetectionManagerModule.emitPhoneStateFromNative(
                "Disconnected",
                phone != null ? phone : "",
                sid
        );
        helperFinalizeComplete = true;
    }

    /** Volta ao estado «detecção ativa» e remove notificação pós-chamada antiga. */
    private void resetForegroundAfterCall() {
        showNotification(
                "SeCretina — detecção ativa",
                "Pronto para a próxima ligação."
        );
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID + 1);
        }
    }

    private void showNotification(String title, String text) {
        ensureChannel();
        Notification notification = buildNotification(title, text);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
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
    }

    private Notification buildNotification(String title, String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(pending)
                .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Gravação em chamada",
                NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Não oculte — necessário para gravar com o app Telefone aberto.");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setSound(null, null);
        ch.setBypassDnd(false);
        nm.createNotificationChannel(ch);
    }

    private void ensurePostCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_POST_CALL,
                "Pós-chamada",
                NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Abre o SeCretina ao terminar a ligação.");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopCallRecording(true);
        stopMonitor();
        releaseWakeLock();
        super.onDestroy();
    }
}
