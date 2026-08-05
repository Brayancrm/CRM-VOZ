package com.pritesh.calldetection;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Log;
import android.view.accessibility.AccessibilityManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.List;

/** Estado do KooMind Helper (com.koomind.helper) — conector de acessibilidade. */
public final class KoomindHelperBridge {

    private static final String TAG = "KooMindHelperBridge";
    public static final String HELPER_PACKAGE = "com.koomind.helper";
    public static final String ACTION_CALL_OFFHOOK = "com.koomind.action.HELPER_CALL_OFFHOOK";
    public static final String ACTION_CALL_IDLE = "com.koomind.action.HELPER_CALL_IDLE";
    public static final String ACTION_CONNECTOR_READY = "com.koomind.action.HELPER_CONNECTOR_READY";
    public static final String ACTION_RECORDING_READY = "com.koomind.action.HELPER_RECORDING_READY";

    private static volatile boolean helperSessionActive = false;
    private static volatile long helperSessionStartedAt = 0L;

    private KoomindHelperBridge() {
    }

    public static boolean isHelperInstalled(Context context) {
        if (context == null) return false;
        try {
            context.getPackageManager().getPackageInfo(HELPER_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    public static boolean isConnectorEnabled(Context context) {
        if (context == null) return false;
        AccessibilityManager am =
                (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null) return false;
        List<AccessibilityServiceInfo> enabled =
                am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        if (enabled == null) return false;
        for (AccessibilityServiceInfo info : enabled) {
            if (info.getResolveInfo() == null || info.getResolveInfo().serviceInfo == null) {
                continue;
            }
            if (HELPER_PACKAGE.equals(info.getResolveInfo().serviceInfo.packageName)) {
                return true;
            }
        }
        return false;
    }

    public static void markHelperCallStarted(Context context) {
        if (!isConnectorEnabled(context)) return;
        helperSessionActive = true;
        helperSessionStartedAt = System.currentTimeMillis();
    }

    public static void markHelperCallEnded() {
        helperSessionActive = false;
    }

    public static boolean shouldUseHelperRecordingMode(Context context) {
        return isConnectorEnabled(context);
    }

    public static boolean isHelperReady(Context context) {
        return isHelperInstalled(context) || isConnectorEnabled(context);
    }

    /** Copia WAV do Helper (FileProvider) para pasta interna do KooMind. */
    public static boolean copyHelperAudioToFile(Context context, Uri uri, File dest) {
        if (context == null || uri == null || dest == null) return false;
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (InputStream in = context.getContentResolver().openInputStream(uri);
             FileOutputStream out = new FileOutputStream(dest)) {
            if (in == null) return false;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) >= 0) {
                if (read == 0) continue;
                out.write(buffer, 0, read);
            }
            return dest.length() > 0;
        } catch (Exception e) {
            Log.e(TAG, "copyHelperAudio", e);
            return false;
        }
    }
}
