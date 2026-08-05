package com.koomind.helper;

import android.accessibilityservice.AccessibilityService;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import androidx.core.content.FileProvider;

import java.io.File;
import java.util.Locale;

/**
 * Conector + gravação MIC no processo Helper (modelo Talker ACR Helper).
 */
public final class KoomindAccessibilityService extends AccessibilityService {

    private static final String TAG = "KooMindHelper";
    private static volatile boolean connectorRunning = false;
    private static volatile boolean callActive = false;

    private TelephonyManager telephonyManager;
    private PhoneStateListener phoneStateListener;
    private final KoomindHelperRecorder recorder = new KoomindHelperRecorder();
    private String activePhone = "";

    public static boolean isConnectorRunning() {
        return connectorRunning;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        connectorRunning = true;
        Log.i(TAG, "App Connector activo");
        registerPhoneListener();
        broadcastConnectorReady();
    }

    @Override
    public void onDestroy() {
        connectorRunning = false;
        if (recorder.isRunning()) {
            finishRecordingAndNotify();
        }
        unregisterPhoneListener();
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            return;
        }
        CharSequence pkgCs = event.getPackageName();
        CharSequence clsCs = event.getClassName();
        if (pkgCs == null || clsCs == null) return;

        String pkg = pkgCs.toString().toLowerCase(Locale.US);
        String cls = clsCs.toString().toLowerCase(Locale.US);
        if (!isDialerPackage(pkg)) return;

        if (isInCallClass(cls) && !callActive) {
            callActive = true;
            Log.i(TAG, "UI chamada detectada " + pkg);
            beginCall("");
        } else if (callActive && isIdleClass(cls)) {
            callActive = false;
            Log.i(TAG, "UI chamada terminada");
            endCall();
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "onInterrupt");
    }

    private void registerPhoneListener() {
        telephonyManager = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
        if (telephonyManager == null) return;

        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                String phone = phoneNumber != null ? phoneNumber : "";
                switch (state) {
                    case TelephonyManager.CALL_STATE_OFFHOOK:
                        if (!callActive) {
                            callActive = true;
                            Log.i(TAG, "Telephony OFFHOOK " + phone);
                            beginCall(phone);
                        }
                        break;
                    case TelephonyManager.CALL_STATE_IDLE:
                        if (callActive) {
                            callActive = false;
                            Log.i(TAG, "Telephony IDLE");
                            endCall();
                        }
                        break;
                    default:
                        break;
                }
            }
        };

        try {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        } catch (SecurityException e) {
            Log.w(TAG, "sem READ_PHONE_STATE no Helper", e);
        }
    }

    private void unregisterPhoneListener() {
        if (telephonyManager != null && phoneStateListener != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        }
        phoneStateListener = null;
        telephonyManager = null;
    }

    private void beginCall(String phone) {
        activePhone = phone != null ? phone : "";
        recorder.start(getApplicationContext(), activePhone);
        sendOffhook(activePhone, recorder.getSessionId());
    }

    private void endCall() {
        finishRecordingAndNotify();
        sendIdle();
    }

    private void finishRecordingAndNotify() {
        KoomindHelperRecorder.Result result = recorder.stopAndFinalize();
        if (result.path == null || result.path.isEmpty()) {
            Log.w(TAG, "sem WAV Helper " + result.diagnostics);
            sendRecordingReady(result, null);
            return;
        }
        try {
            File file = new File(result.path);
            Uri uri = FileProvider.getUriForFile(
                    this,
                    HelperConstants.FILE_PROVIDER_AUTHORITY,
                    file
            );
            grantUriPermission(
                    HelperConstants.KOOMIND_PACKAGE,
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
            sendRecordingReady(result, uri);
        } catch (Exception e) {
            Log.e(TAG, "FileProvider", e);
            sendRecordingReady(result, null);
        }
    }

    private static boolean isDialerPackage(String pkg) {
        return pkg.contains("incallui")
                || pkg.contains("dialer")
                || pkg.contains("phone")
                || pkg.contains("telecom")
                || pkg.contains("samsung.android.app.telephonyui");
    }

    private static boolean isInCallClass(String cls) {
        return cls.contains("incall")
                || cls.contains("callactivity")
                || cls.contains("voicecall")
                || cls.contains("callui");
    }

    private static boolean isIdleClass(String cls) {
        return cls.contains("dialtacts")
                || cls.contains("mainactivity")
                || cls.contains("launcher");
    }

    private void sendOffhook(String phone, String sessionId) {
        Intent intent = new Intent(HelperConstants.ACTION_CALL_OFFHOOK);
        intent.setPackage(HelperConstants.KOOMIND_PACKAGE);
        intent.putExtra(HelperConstants.EXTRA_PHONE, phone != null ? phone : "");
        intent.putExtra(HelperConstants.EXTRA_SESSION_ID, sessionId != null ? sessionId : "");
        intent.putExtra(HelperConstants.EXTRA_SOURCE, "helper");
        sendBroadcast(intent);
    }

    private void sendRecordingReady(KoomindHelperRecorder.Result result, Uri audioUri) {
        Intent intent = new Intent(HelperConstants.ACTION_RECORDING_READY);
        intent.setPackage(HelperConstants.KOOMIND_PACKAGE);
        intent.putExtra(HelperConstants.EXTRA_SOURCE, "helper");
        intent.putExtra(HelperConstants.EXTRA_SESSION_ID, result.sessionId != null ? result.sessionId : "");
        intent.putExtra(HelperConstants.EXTRA_PHONE, activePhone != null ? activePhone : "");
        intent.putExtra(HelperConstants.EXTRA_DIAGNOSTICS, result.diagnostics != null ? result.diagnostics : "");
        intent.putExtra(HelperConstants.EXTRA_MAX_RMS, result.maxRms);
        if (audioUri != null) {
            intent.putExtra(HelperConstants.EXTRA_AUDIO_URI, audioUri.toString());
            intent.setClipData(ClipData.newRawUri("audio", audioUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        sendBroadcast(intent);
        Log.i(TAG, "RECORDING_READY maxRms=" + result.maxRms + " diag=" + result.diagnostics);
    }

    private void sendIdle() {
        Intent intent = new Intent(HelperConstants.ACTION_CALL_IDLE);
        intent.setPackage(HelperConstants.KOOMIND_PACKAGE);
        intent.putExtra(HelperConstants.EXTRA_SOURCE, "helper");
        sendBroadcast(intent);
    }

    private void broadcastConnectorReady() {
        Intent intent = new Intent(HelperConstants.ACTION_CONNECTOR_READY);
        intent.setPackage(HelperConstants.KOOMIND_PACKAGE);
        intent.putExtra(HelperConstants.EXTRA_SOURCE, "helper");
        sendBroadcast(intent);
    }
}
