package com.pritesh.calldetection;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.util.Log;

/**
 * Número da ligação recente — Samsung muitas vezes não envia EXTRA_INCOMING_NUMBER.
 */
public final class KoomindCallLogHelper {

    private static final String TAG = "KooMindCallLog";
    /** Só ligações dos últimos 5 minutos (evita pegar chamada antiga do mesmo dia). */
    private static final long RECENT_WINDOW_MS = 5 * 60 * 1000;

    private KoomindCallLogHelper() {
    }

    public static String resolveRecentCallNumber(Context context) {
        if (context == null) return null;
        if (context.checkSelfPermission(Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED) {
            return null;
        }

        long since = System.currentTimeMillis() - RECENT_WINDOW_MS;
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                    CallLog.Calls.CONTENT_URI,
                    new String[]{
                            CallLog.Calls.NUMBER,
                            CallLog.Calls.DATE,
                            CallLog.Calls.TYPE,
                    },
                    CallLog.Calls.DATE + " >= ?",
                    new String[]{String.valueOf(since)},
                    CallLog.Calls.DATE + " DESC"
            );
            if (cursor == null) return null;

            while (cursor.moveToNext()) {
                int numIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER);
                if (numIdx < 0) continue;
                String raw = cursor.getString(numIdx);
                String digits = digitsOnly(raw);
                if (digits.length() >= 7) {
                    Log.d(TAG, "recent call number=" + digits);
                    return digits;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "read call log", e);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    public static String enrichPhone(Context context, String phoneFromTelephony) {
        String trimmed = phoneFromTelephony != null ? phoneFromTelephony.trim() : "";
        String digits = digitsOnly(trimmed);
        if (digits.length() >= 7) {
            return digits;
        }
        String fromLog = resolveRecentCallNumber(context);
        return fromLog != null ? fromLog : digits;
    }

    private static String digitsOnly(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= '0' && c <= '9') {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
