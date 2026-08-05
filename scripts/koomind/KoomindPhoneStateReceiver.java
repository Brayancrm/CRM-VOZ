package com.pritesh.calldetection;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;
import android.util.Log;

/**
 * Detecta ligação mesmo com o KooMind fechado — inicia gravação/notificação sem JS.
 */
public class KoomindPhoneStateReceiver extends BroadcastReceiver {

    private static final String TAG = "KooMindPhoneRx";
    private static boolean wasOffHook = false;
    private static boolean wasRinging = false;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) {
            return;
        }

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (state == null) {
            return;
        }

        Context app = context.getApplicationContext();
        String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            wasRinging = true;
            Log.d(TAG, "RINGING " + number);
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            wasOffHook = true;
            wasRinging = false;
            final String phone = number != null ? number : "";
            Log.d(TAG, "OFFHOOK " + phone);
            KoomindCallMonitorService.notifyOffhook(app, phone);
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            if (wasOffHook) {
                Log.d(TAG, "IDLE após ligação");
                KoomindCallMonitorService.notifyCallEnded(app);
            }
            wasOffHook = false;
            wasRinging = false;
        }
    }

}
