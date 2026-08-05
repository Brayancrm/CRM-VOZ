package com.pritesh.calldetection;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

/**
 * Recebe eventos do KooMind Helper (Accessibility App Connector).
 */
public final class KoomindHelperReceiver extends BroadcastReceiver {

    private static final String TAG = "KooMindHelperRx";
    private static final String EXTRA_SOURCE = "source";
    private static final String SOURCE_HELPER = "helper";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) {
            return;
        }

        String source = intent.getStringExtra(EXTRA_SOURCE);
        if (!SOURCE_HELPER.equals(source)) {
            Log.w(TAG, "broadcast ignorado source=" + source);
            return;
        }

        Context app = context.getApplicationContext();
        String action = intent.getAction();

        if (KoomindHelperBridge.ACTION_CONNECTOR_READY.equals(action)) {
            Log.i(TAG, "Helper connector ready");
            return;
        }

        if (KoomindHelperBridge.ACTION_CALL_OFFHOOK.equals(action)) {
            String phone = intent.getStringExtra("phone");
            String sessionId = intent.getStringExtra("sessionId");
            Log.i(TAG, "Helper OFFHOOK phone=" + phone + " session=" + sessionId);
            KoomindHelperBridge.markHelperCallStarted(app);
            KoomindCallMonitorService.notifyOffhookFromHelper(
                    app,
                    phone != null ? phone : "",
                    sessionId != null ? sessionId : ""
            );
            return;
        }

        if (KoomindHelperBridge.ACTION_RECORDING_READY.equals(action)) {
            String sessionId = intent.getStringExtra("sessionId");
            String phone = intent.getStringExtra("phone");
            String diagnostics = intent.getStringExtra("diagnostics");
            double maxRms = intent.getDoubleExtra("maxRms", 0);
            String uriStr = intent.getStringExtra("audioUri");
            Uri audioUri = uriStr != null && !uriStr.isEmpty() ? Uri.parse(uriStr) : null;
            Log.i(TAG, "Helper RECORDING_READY session=" + sessionId + " maxRms=" + maxRms);
            KoomindCallMonitorService.applyHelperRecording(
                    app,
                    sessionId != null ? sessionId : "",
                    phone != null ? phone : "",
                    audioUri,
                    diagnostics != null ? diagnostics : "",
                    maxRms
            );
            return;
        }

        if (KoomindHelperBridge.ACTION_CALL_IDLE.equals(action)) {
            Log.i(TAG, "Helper IDLE");
            KoomindHelperBridge.markHelperCallEnded();
            KoomindCallMonitorService.notifyCallEnded(app);
        }
    }
}
