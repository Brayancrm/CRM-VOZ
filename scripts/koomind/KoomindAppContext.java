package com.pritesh.calldetection;

import android.content.Context;

/** Contexto de aplicação para callbacks nativos (ex.: parar FGS ACR). */
public final class KoomindAppContext {

    private static Context appContext;

    private KoomindAppContext() {
    }

    public static void init(Context context) {
        if (context != null) {
            appContext = context.getApplicationContext();
        }
    }

    public static Context get() {
        return appContext;
    }
}
