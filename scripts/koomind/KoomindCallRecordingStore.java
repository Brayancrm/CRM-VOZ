package com.pritesh.calldetection;

import androidx.annotation.Nullable;

public final class KoomindCallRecordingStore {

    public static final class FinishedCall {
        public final String sessionId;
        public final String phone;
        public final String audioPath;
        public final long startedAt;
        public final long endedAt;
        public final long fileSizeBytes;

        FinishedCall(
                String sessionId,
                String phone,
                String audioPath,
                long startedAt,
                long endedAt,
                long fileSizeBytes
        ) {
            this.sessionId = sessionId;
            this.phone = phone;
            this.audioPath = audioPath;
            this.startedAt = startedAt;
            this.endedAt = endedAt;
            this.fileSizeBytes = fileSizeBytes;
        }
    }

    private static volatile boolean recording = false;
    private static volatile String activeSessionId;
    private static volatile String activePhone;
    private static volatile long activeStartedAt;
    private static volatile FinishedCall pendingFinished;
    private static volatile String lastError = "";
    /** Último relatório técnico da gravação (RMS, fonte, erros read). */
    private static volatile String lastRecordingDiagnostics = "";

    private KoomindCallRecordingStore() {
    }

    public static synchronized void syncActiveSessionId(String sessionId) {
        if (sessionId == null || sessionId.isEmpty()) return;
        activeSessionId = sessionId;
    }

    public static synchronized void startSession(String sessionId, String phone) {
        recording = true;
        activeSessionId = sessionId;
        activePhone = phone != null ? phone : "";
        activeStartedAt = System.currentTimeMillis();
        pendingFinished = null;
        lastError = "";
        lastRecordingDiagnostics = "";
    }

    public static synchronized void finishSession(
            String sessionId,
            String phone,
            String audioPath,
            long endedAt,
            long fileSizeBytes
    ) {
        recording = false;
        pendingFinished = new FinishedCall(
                sessionId,
                phone != null ? phone : "",
                audioPath,
                activeStartedAt > 0 ? activeStartedAt : endedAt,
                endedAt,
                fileSizeBytes
        );
        activeSessionId = null;
        activePhone = null;
        activeStartedAt = 0;
    }

    /** Ligação terminou mas microfone estava mudo — JS abre pós-chamada para nota manual. */
    public static synchronized void finishSessionWithoutAudio(
            String sessionId,
            String phone,
            long endedAt
    ) {
        recording = false;
        pendingFinished = new FinishedCall(
                sessionId,
                phone != null ? phone : "",
                "",
                activeStartedAt > 0 ? activeStartedAt : endedAt,
                endedAt,
                0
        );
        activeSessionId = null;
        activePhone = null;
        activeStartedAt = 0;
    }

    public static synchronized void clearPending() {
        pendingFinished = null;
    }

    /** Cancela gravação ativa sem entregar arquivo ao JS (troca para microfone do app). */
    public static synchronized void cancelActiveSession() {
        recording = false;
        activeSessionId = null;
        activePhone = null;
        activeStartedAt = 0;
    }

    public static synchronized void setLastError(String error) {
        lastError = error != null ? error : "";
    }

    public static synchronized String getLastError() {
        return lastError;
    }

    public static synchronized void setLastRecordingDiagnostics(String text) {
        lastRecordingDiagnostics = text != null ? text : "";
    }

    public static synchronized String getLastRecordingDiagnostics() {
        return lastRecordingDiagnostics;
    }

    public static synchronized boolean isRecording() {
        return recording;
    }

    @Nullable
    public static synchronized String getActiveSessionId() {
        return activeSessionId;
    }

    @Nullable
    public static synchronized String getActivePhone() {
        return activePhone;
    }

    public static synchronized long getActiveStartedAt() {
        return activeStartedAt;
    }

    @Nullable
    public static synchronized FinishedCall consumePending() {
        FinishedCall finished = pendingFinished;
        pendingFinished = null;
        return finished;
    }

    @Nullable
    public static synchronized FinishedCall peekPending() {
        return pendingFinished;
    }
}
