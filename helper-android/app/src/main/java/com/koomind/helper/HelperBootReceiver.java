package com.koomind.helper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Mantém referência viva após reboot (serviço activado pelo utilizador). */
public final class HelperBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        /* AccessibilityService é reiniciado pelo sistema se estava activo. */
    }
}
