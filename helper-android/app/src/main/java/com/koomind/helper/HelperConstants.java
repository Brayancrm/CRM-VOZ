package com.koomind.helper;

/** Contrato entre KooMind Helper e app principal. */
public final class HelperConstants {

    public static final String KOOMIND_PACKAGE = "com.koomind.app";
    public static final String HELPER_PACKAGE = "com.koomind.helper";

    public static final String ACTION_CALL_OFFHOOK = "com.koomind.action.HELPER_CALL_OFFHOOK";
    public static final String ACTION_CALL_IDLE = "com.koomind.action.HELPER_CALL_IDLE";
    public static final String ACTION_CONNECTOR_READY = "com.koomind.action.HELPER_CONNECTOR_READY";

    public static final String ACTION_RECORDING_READY = "com.koomind.action.HELPER_RECORDING_READY";

    public static final String EXTRA_PHONE = "phone";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_AUDIO_URI = "audioUri";
    public static final String EXTRA_DIAGNOSTICS = "diagnostics";
    public static final String EXTRA_MAX_RMS = "maxRms";

    public static final String FILE_PROVIDER_AUTHORITY = "com.koomind.helper.recording";

    public static final String SERVICE_ID =
            "com.koomind.helper/.KoomindAccessibilityService";

    private HelperConstants() {
    }
}
