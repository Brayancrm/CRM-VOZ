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
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.util.UUID;

/**
 * Gravação em foreground durante ligação (funciona com app fechado).
 * Tenta várias fontes de áudio — Samsung costuma bloquear MIC durante GSM.
 */
public class KoomindCallRecordingService extends Service {

    private static final String TAG = "KooMindRecord";
    public static final String ACTION_START = "com.koomind.action.START_RECORDING";
    public static final String ACTION_STOP = "com.koomind.action.STOP_RECORDING";
    public static final String ACTION_ABANDON = "com.koomind.action.ABANDON_RECORDING";
    public static final String EXTRA_PHONE = "phone";
    public static final String EXTRA_DISPLAY = "display";

    private static final String CHANNEL_ID = "gravacao-chamada";
    private static final int NOTIFICATION_ID = 41001;
    private static final long MIN_VALID_BYTES = 800;

    private MediaRecorder mediaRecorder;
    private String sessionId;
    private String phoneNumber;
    private String displayLabel;
    private String outputPath;
    private int audioSourceUsed = -1;
    private boolean audioModeChanged = false;

    public static void startRecording(Context context, String phone) {
        Intent intent = new Intent(context, KoomindCallRecordingService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_PHONE, phone != null ? phone : "");
        intent.putExtra(EXTRA_DISPLAY, formatDisplayPhone(phone));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopRecording(Context context) {
        Intent intent = new Intent(context, KoomindCallRecordingService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    /** Para gravação nativa sem salvar (app aberto usará Expo AV). */
    public static void abandonRecording(Context context) {
        Intent intent = new Intent(context, KoomindCallRecordingService.class);
        intent.setAction(ACTION_ABANDON);
        context.startService(intent);
    }

    private static String formatDisplayPhone(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            return "ligação";
        }
        return phone.trim();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopRecordingInternal(false);
            return START_NOT_STICKY;
        }
        if (ACTION_ABANDON.equals(action)) {
            stopRecordingInternal(true);
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) {
            phoneNumber = intent.getStringExtra(EXTRA_PHONE);
            displayLabel = intent.getStringExtra(EXTRA_DISPLAY);
            if (displayLabel == null || displayLabel.isEmpty()) {
                displayLabel = formatDisplayPhone(phoneNumber);
            }
            if (KoomindCallRecordingStore.isRecording()) {
                updateNotification(displayLabel);
                return START_STICKY;
            }
            beginRecording();
            return START_STICKY;
        }
        return START_NOT_STICKY;
    }

    private void prepareAudioForCall() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                return;
            }
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioModeChanged = true;
        } catch (Exception e) {
            Log.w(TAG, "audio mode", e);
        }
    }

    private void restoreAudioMode() {
        if (!audioModeChanged) {
            return;
        }
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception e) {
            Log.w(TAG, "restore audio mode", e);
        }
        audioModeChanged = false;
    }

    private void beginRecording() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO não concedido");
            KoomindCallRecordingStore.setLastError("Sem permissão de microfone");
            stopSelf();
            return;
        }

        sessionId = UUID.randomUUID().toString();
        KoomindCallRecordingStore.startSession(sessionId, phoneNumber);

        File dir = new File(getFilesDir(), "koomind_recordings");
        if (!dir.exists() && !dir.mkdirs()) {
            Log.e(TAG, "falha ao criar pasta");
            KoomindCallRecordingStore.setLastError("Pasta de gravação indisponível");
            KoomindCallRecordingStore.clearPending();
            stopSelf();
            return;
        }

        outputPath = new File(dir, sessionId + ".m4a").getAbsolutePath();

        Notification notification = buildNotification(displayLabel);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        prepareAudioForCall();

        int[] sources = new int[]{
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                MediaRecorder.AudioSource.MIC,
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                MediaRecorder.AudioSource.DEFAULT,
        };

        Exception lastError = null;
        for (int source : sources) {
            try {
                startRecorderWithSource(source);
                audioSourceUsed = source;
                KoomindCallRecordingStore.setLastError("");
                Log.d(TAG, "gravando source=" + source + " path=" + outputPath);
                return;
            } catch (Exception e) {
                lastError = e;
                Log.w(TAG, "source " + source + " falhou", e);
                releaseRecorder();
            }
        }

        String err = lastError != null ? lastError.getMessage() : "MediaRecorder falhou";
        KoomindCallRecordingStore.setLastError(err != null ? err : "Gravação não iniciou");
        Log.e(TAG, "nenhuma fonte de áudio funcionou");
        KoomindCallRecordingStore.clearPending();
        restoreAudioMode();
        stopForeground(true);
        stopSelf();
    }

    private void startRecorderWithSource(int source) throws Exception {
        mediaRecorder = new MediaRecorder();
        mediaRecorder.setAudioSource(source);
        mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        mediaRecorder.setAudioSamplingRate(16000);
        mediaRecorder.setAudioEncodingBitRate(64000);
        mediaRecorder.setOutputFile(outputPath);
        mediaRecorder.prepare();
        mediaRecorder.start();
    }

    private void stopRecordingInternal(boolean abandon) {
        if (!KoomindCallRecordingStore.isRecording() && mediaRecorder == null) {
            stopForeground(true);
            stopSelf();
            return;
        }

        String finishedSessionId = sessionId;
        String finishedPhone = phoneNumber;
        long endedAt = System.currentTimeMillis();
        String path = outputPath;

        releaseRecorder();
        restoreAudioMode();

        if (abandon) {
            if (path != null) {
                File f = new File(path);
                if (f.exists()) {
                    f.delete();
                }
            }
            KoomindCallRecordingStore.cancelActiveSession();
            KoomindCallRecordingStore.clearPending();
            Log.d(TAG, "gravação nativa abandonada (app em primeiro plano)");
        } else {
            long fileSize = 0;
            boolean validFile = false;
            if (path != null) {
                File f = new File(path);
                if (f.exists()) {
                    fileSize = f.length();
                    validFile = fileSize >= MIN_VALID_BYTES;
                }
                Log.d(TAG, "arquivo " + path + " bytes=" + fileSize + " source=" + audioSourceUsed);
            }

            if (finishedSessionId != null && validFile && path != null) {
                KoomindCallRecordingStore.finishSession(
                        finishedSessionId,
                        finishedPhone,
                        path,
                        endedAt,
                        fileSize
                );
            } else {
                String msg = fileSize > 0
                        ? "Áudio muito curto (" + fileSize + " bytes). Use viva-voz ou fone na próxima ligação."
                        : "Microfone indisponível durante a ligação (comum no Samsung). Use «Iniciar gravação» no contato ou viva-voz.";
                KoomindCallRecordingStore.setLastError(msg);
                KoomindCallRecordingStore.clearPending();
                Log.w(TAG, msg);
            }
        }

        sessionId = null;
        phoneNumber = null;
        outputPath = null;
        audioSourceUsed = -1;

        stopForeground(true);
        stopSelf();
    }

    private void releaseRecorder() {
        if (mediaRecorder == null) {
            return;
        }
        try {
            mediaRecorder.stop();
        } catch (Exception e) {
            Log.w(TAG, "stop recorder", e);
        }
        try {
            mediaRecorder.release();
        } catch (Exception e) {
            Log.w(TAG, "release recorder", e);
        }
        mediaRecorder = null;
    }

    private Notification buildNotification(String titleName) {
        ensureChannel();

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = PendingIntent.getActivity(
                this,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Gravando — " + titleName)
                .setContentText("Só a sua voz · use fone ou viva-voz se o áudio sair mudo")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setContentIntent(pending)
                .build();
    }

    private void updateNotification(String titleName) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(titleName));
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Gravação em chamada",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Aparece ao detectar ligação, mesmo com o app fechado.");
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseRecorder();
        restoreAudioMode();
        super.onDestroy();
    }
}
