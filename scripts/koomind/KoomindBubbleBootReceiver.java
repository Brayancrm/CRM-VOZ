package com.pritesh.calldetection;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Reinicia a bolha após boot, se estava activa. */
public final class KoomindBubbleBootReceiver extends BroadcastReceiver {
    private static final String TAG = "KooMindBubbleBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        if (!KoomindBubbleService.isEnabled(context)) return;
        if (!KoomindBubbleService.canDrawOverlays(context)) {
            Log.w(TAG, "Bolha activa nas prefs mas sem overlay");
            return;
        }
        try {
            KoomindBubbleService.start(context);
            Log.i(TAG, "Bolha reiniciada após boot");
        } catch (Exception e) {
            Log.e(TAG, "Falha ao reiniciar bolha", e);
        }
    }
}
