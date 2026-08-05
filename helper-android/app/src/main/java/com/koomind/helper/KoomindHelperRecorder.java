package com.koomind.helper;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.Locale;
import java.util.UUID;

/** Grava no processo Helper — VOICE_COMM + viva-voz, fallback MIC. */
final class KoomindHelperRecorder {

    private static final String TAG = "KooMindHelperRec";
    private static final int SAMPLE_RATE = 44_100;
    private static final double MIN_SPEECH_RMS = 80.0;
    private static final int SWITCH_AFTER_CHUNKS = 40;

    private AudioRecord audioRecord;
    private Thread readerThread;
    private volatile boolean running;
    private RandomAccessFile wavFile;
    private String outputPath;
    private String sessionId;
    private String phone;
    private long pcmBytesWritten;
    private double maxRmsSeen;
    private int chunkCount;
    private int readErrors;
    private String activeSourceLabel = "MIC@16k";
    private int activeSource = MediaRecorder.AudioSource.MIC;
    private AudioManager audioManager;
    private int previousAudioMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerphone;

    private static final int[] SOURCE_CHAIN = {
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC,
    };
    private static final String[] SOURCE_LABELS = {
            "VCOMM@44k",
            "VREC@44k",
            "MIC@44k",
    };

    static final class Result {
        final String sessionId;
        final String path;
        final double maxRms;
        final long pcmBytes;
        final String diagnostics;

        Result(String sessionId, String path, double maxRms, long pcmBytes, String diagnostics) {
            this.sessionId = sessionId;
            this.path = path;
            this.maxRms = maxRms;
            this.pcmBytes = pcmBytes;
            this.diagnostics = diagnostics;
        }
    }

    void start(Context context, String phoneNumber) {
        stopInternal(false);
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO negado no Helper");
            return;
        }
        sessionId = UUID.randomUUID().toString();
        phone = phoneNumber != null ? phoneNumber : "";
        File dir = new File(context.getFilesDir(), "helper_recordings");
        if (!dir.exists()) dir.mkdirs();
        outputPath = new File(dir, sessionId + ".wav").getAbsolutePath();
        pcmBytesWritten = 0;
        maxRmsSeen = 0;
        chunkCount = 0;
        readErrors = 0;
        activeSource = SOURCE_CHAIN[0];
        activeSourceLabel = SOURCE_LABELS[0];

        prepareCallAudio(context);
        if (!openRecorder(activeSource)) {
            restoreCallAudio();
            return;
        }

        running = true;
        final int chunkSize = readSizeFor(activeSource);
        readerThread = new Thread(() -> readLoop(context, chunkSize), "KooMind-Helper-MIC");
        readerThread.start();
        try {
            audioRecord.startRecording();
            Log.i(TAG, "Helper activo " + activeSourceLabel + " " + outputPath);
        } catch (Exception e) {
            Log.e(TAG, "startRecording", e);
            stopInternal(false);
            restoreCallAudio();
        }
    }

    private int readSizeFor(int source) {
        int minBuffer = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBuffer <= 0) minBuffer = SAMPLE_RATE;
        return Math.max(minBuffer, SAMPLE_RATE / 5);
    }

    private boolean openRecorder(int source) {
        releaseRecord();
        int readSize = readSizeFor(source);
        try {
            audioRecord = new AudioRecord(
                    source,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    readSize * 4
            );
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.w(TAG, "fonte não inicializou " + source);
                releaseRecord();
                return false;
            }
            if (wavFile == null) {
                wavFile = new RandomAccessFile(outputPath, "rw");
                wavFile.setLength(0);
                wavFile.write(new byte[44]);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "openRecorder", e);
            releaseRecord();
            return false;
        }
    }

    private void prepareCallAudio(Context context) {
        try {
            audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;
            previousAudioMode = audioManager.getMode();
            previousSpeakerphone = audioManager.isSpeakerphoneOn();
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(true);
            Log.i(TAG, "AudioManager IN_COMMUNICATION + speakerphone");
        } catch (Exception e) {
            Log.w(TAG, "prepareCallAudio", e);
        }
    }

    private void restoreCallAudio() {
        try {
            if (audioManager == null) return;
            audioManager.setSpeakerphoneOn(previousSpeakerphone);
            audioManager.setMode(previousAudioMode);
        } catch (Exception e) {
            Log.w(TAG, "restoreCallAudio", e);
        }
        audioManager = null;
    }

    Result stopAndFinalize() {
        stopInternal(true);
        restoreCallAudio();
        if (outputPath == null || pcmBytesWritten < 8_000) {
            deleteOutput();
            return new Result(sessionId, "", maxRmsSeen, pcmBytesWritten, buildDiagnostics(false));
        }
        try {
            writeWavHeader(pcmBytesWritten);
            closeFile();
            Log.i(TAG, "WAV Helper OK " + buildDiagnostics(true));
            return new Result(sessionId, outputPath, maxRmsSeen, pcmBytesWritten, buildDiagnostics(true));
        } catch (IOException e) {
            Log.e(TAG, "header", e);
            deleteOutput();
            return new Result(sessionId, "", maxRmsSeen, pcmBytesWritten, buildDiagnostics(false));
        }
    }

    private String buildDiagnostics(boolean ok) {
        return String.format(Locale.US,
                "pipe=HELPER_PROC | %s | c=%d err=%d maxRms=%.0f pcm=%d ok=%s",
                activeSourceLabel, chunkCount, readErrors, maxRmsSeen, pcmBytesWritten, ok ? "Y" : "N");
    }

    private void readLoop(Context context, int chunkSize) {
        byte[] buffer = new byte[chunkSize];
        int sourceIndex = 0;
        int chunksSinceSwitch = 0;
        while (running && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);
            if (read < 0) {
                readErrors++;
                continue;
            }
            if (read == 0) continue;
            chunkCount++;
            chunksSinceSwitch++;
            double rms = computeRms(buffer, read / 2);
            if (rms > maxRmsSeen) maxRmsSeen = rms;

            if (maxRmsSeen < MIN_SPEECH_RMS
                    && chunksSinceSwitch >= SWITCH_AFTER_CHUNKS
                    && sourceIndex < SOURCE_CHAIN.length - 1) {
                sourceIndex++;
                chunksSinceSwitch = 0;
                activeSource = SOURCE_CHAIN[sourceIndex];
                activeSourceLabel = SOURCE_LABELS[sourceIndex];
                Log.i(TAG, "Trocar fonte → " + activeSourceLabel + " (maxRms=" + maxRmsSeen + ")");
                if (openRecorder(activeSource)) {
                    try {
                        audioRecord.startRecording();
                    } catch (Exception e) {
                        Log.e(TAG, "switch startRecording", e);
                    }
                }
                continue;
            }

            try {
                if (wavFile != null) {
                    wavFile.write(buffer, 0, read);
                    pcmBytesWritten += read;
                }
            } catch (IOException e) {
                Log.e(TAG, "write", e);
            }
        }
    }

    private void stopInternal(boolean finalize) {
        running = false;
        releaseRecord();
        if (readerThread != null) {
            try {
                readerThread.join(2000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            readerThread = null;
        }
        if (!finalize) {
            closeFile();
        }
    }

    private void releaseRecord() {
        if (audioRecord == null) return;
        try {
            if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                audioRecord.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            audioRecord.release();
        } catch (Exception ignored) {
        }
        audioRecord = null;
    }

    private static double computeRms(byte[] pcm, int sampleCount) {
        if (sampleCount <= 0) return 0;
        long sum = 0;
        for (int i = 0; i < sampleCount; i++) {
            int lo = pcm[i * 2] & 0xff;
            int hi = pcm[i * 2 + 1];
            short sample = (short) (lo | (hi << 8));
            sum += (long) sample * sample;
        }
        return Math.sqrt(sum / (double) sampleCount);
    }

    private void closeFile() {
        if (wavFile == null) return;
        try {
            wavFile.close();
        } catch (IOException ignored) {
        }
        wavFile = null;
    }

    private void deleteOutput() {
        closeFile();
        if (outputPath != null) new File(outputPath).delete();
    }

    private void writeWavHeader(long pcmLen) throws IOException {
        if (wavFile == null) return;
        int byteRate = SAMPLE_RATE * 2;
        wavFile.seek(0);
        wavFile.writeBytes("RIFF");
        wavFile.writeInt(Integer.reverseBytes((int) pcmLen + 36));
        wavFile.writeBytes("WAVE");
        wavFile.writeBytes("fmt ");
        wavFile.writeInt(Integer.reverseBytes(16));
        wavFile.writeShort(Short.reverseBytes((short) 1));
        wavFile.writeShort(Short.reverseBytes((short) 1));
        wavFile.writeInt(Integer.reverseBytes(SAMPLE_RATE));
        wavFile.writeInt(Integer.reverseBytes(byteRate));
        wavFile.writeShort(Short.reverseBytes((short) 2));
        wavFile.writeShort(Short.reverseBytes((short) 16));
        wavFile.writeBytes("data");
        wavFile.writeInt(Integer.reverseBytes((int) pcmLen));
    }

    String getSessionId() {
        return sessionId;
    }

    String getPhone() {
        return phone;
    }

    boolean isRunning() {
        return running;
    }
}
