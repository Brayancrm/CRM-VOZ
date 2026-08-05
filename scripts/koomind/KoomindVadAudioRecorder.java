package com.pritesh.calldetection;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Samsung GSM — várias rotas de áudio + cadeia de fontes:
 * OFFHOOK + {@link KoomindCallMonitorService#DELAY_OFFHOOK_MS}
 * → pipeline D (NORMAL+MIC) primeiro → A/B/C → VOICE_CALL, VOICE_COMM, VREC, CAM, MIC.
 */
public final class KoomindVadAudioRecorder {

    private static final String TAG = "KooMindVAD";
    private static final int CHANNEL = AudioFormat.CHANNEL_IN_MONO;
    private static final int ENCODING = AudioFormat.ENCODING_PCM_16BIT;
    private static final int RING_SECONDS = 3;
    /** Fonte 4 — VOICE_CALL (GSM); pode falhar init em alguns builds. */
    private static final int AUDIO_SOURCE_VOICE_CALL = 4;

    static final int DELAY_AFTER_MODE_MS = 200;
    static final int DELAY_AFTER_SPEAKER_MS = 300;

    private static final int SWITCH_AFTER_CHUNKS = 30;
    private static final int SWITCH_PIPELINE_AFTER_CHUNKS = 120;
    private static final double SILENT_RMS = 50.0;

    private static final class RoutePipeline {
        final int audioMode;
        final boolean forceSpeaker;
        /** Não altera mode nem speaker — microfone físico com roteamento do Telefone. */
        final boolean skipAudioRouteChanges;
        final String label;
        final RecordConfig[] chain;

        RoutePipeline(
                int audioMode,
                boolean forceSpeaker,
                boolean skipAudioRouteChanges,
                String label,
                RecordConfig[] chain
        ) {
            this.audioMode = audioMode;
            this.forceSpeaker = forceSpeaker;
            this.skipAudioRouteChanges = skipAudioRouteChanges;
            this.label = label;
            this.chain = chain;
        }
    }

    private static RecordConfig[] buildMicPhysicalChain() {
        return new RecordConfig[]{
                new RecordConfig(MediaRecorder.AudioSource.MIC, 16_000, "MIC@16k", "MIC16"),
                new RecordConfig(MediaRecorder.AudioSource.MIC, 44_100, "MIC@44k", "MIC44"),
        };
    }

    private static final RoutePipeline[] ROUTE_PIPELINES = new RoutePipeline[]{
            new RoutePipeline(
                    AudioManager.MODE_NORMAL,
                    false,
                    true,
                    "NORMAL+MIC",
                    buildMicPhysicalChain()
            ),
            new RoutePipeline(
                    AudioManager.MODE_IN_COMMUNICATION,
                    true,
                    false,
                    "IN_COMM+SPK",
                    buildFallbackChain()
            ),
            new RoutePipeline(
                    AudioManager.MODE_IN_CALL,
                    false,
                    false,
                    "IN_CALL+EAR",
                    buildFallbackChain()
            ),
            new RoutePipeline(
                    AudioManager.MODE_IN_COMMUNICATION,
                    false,
                    false,
                    "IN_COMM+EAR",
                    buildFallbackChain()
            ),
    };

    private static final class RecordConfig {
        final int source;
        final int sampleRate;
        final String label;
        final String probeTag;

        RecordConfig(int source, int sampleRate, String label, String probeTag) {
            this.source = source;
            this.sampleRate = sampleRate;
            this.label = label;
            this.probeTag = probeTag;
        }
    }

    private static RecordConfig[] buildFallbackChain() {
        return new RecordConfig[]{
                new RecordConfig(AUDIO_SOURCE_VOICE_CALL, 8_000, "VOICE_CALL@8k", "VC8"),
                new RecordConfig(AUDIO_SOURCE_VOICE_CALL, 16_000, "VOICE_CALL@16k", "VC16"),
                new RecordConfig(
                        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                        8_000,
                        "VOICE_COMM@8k",
                        "VCOM8"
                ),
                new RecordConfig(
                        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                        16_000,
                        "VOICE_COMM@16k",
                        "VCOM16"
                ),
                new RecordConfig(
                        MediaRecorder.AudioSource.VOICE_RECOGNITION,
                        16_000,
                        "VREC@16k",
                        "VREC16"
                ),
                new RecordConfig(
                        MediaRecorder.AudioSource.CAMCORDER,
                        16_000,
                        "CAM@16k",
                        "CAM16"
                ),
                new RecordConfig(MediaRecorder.AudioSource.MIC, 8_000, "MIC@8k", "MIC8"),
                new RecordConfig(MediaRecorder.AudioSource.MIC, 16_000, "MIC@16k", "MIC16"),
        };
    }

    private AudioRecord audioRecord;
    private Thread readerThread;
    private volatile boolean running;
    private volatile boolean speechStarted;
    private volatile boolean hadSpeech;

    private byte[] ringBuffer;
    private int ringSize;
    private int ringWritePos;
    private int ringFilled;

    private RandomAccessFile wavFile;
    private String outputPath;
    private long pcmBytesWritten;

    private String audioSourceLabel = "?";
    private String pipelineLabel = "?";
    private final StringBuilder initProbeLog = new StringBuilder();
    private RoutePipeline activePipeline;
    private int nextPipelineIndex = 1;

    private int activeSampleRate = 8_000;
    private int readErrorCount;
    private int zeroReadCount;
    private int chunkCount;
    private double maxRmsSeen;
    private int sourceSwitchCount;
    private int pipelineSwitchCount;
    private int nextFallbackIndex = 1;

    private Context routeContext;
    private boolean audioRoutePrepared;
    private int savedVoiceCallVolume = -1;
    private boolean savedSpeakerphone;
    private int savedAudioMode = AudioManager.MODE_NORMAL;

    public boolean start(Context context, String wavPath) {
        if (running) return true;
        outputPath = wavPath;
        resetSessionCounters();
        routeContext = context.getApplicationContext();

        final AtomicBoolean ok = new AtomicBoolean(false);
        final CountDownLatch latch = new CountDownLatch(1);

        Thread initThread = new Thread(() -> {
            try {
                if (!runSamsungPipelineAndRecord()) {
                    KoomindCallRecordingStore.setLastError(
                            "Microfone indisponível na ligação — use viva-voz e volume alto"
                    );
                } else {
                    ok.set(true);
                }
            } catch (Exception e) {
                Log.e(TAG, "pipeline", e);
                KoomindCallRecordingStore.setLastError(
                        "Erro ao iniciar gravação: " + e.getMessage()
                );
            } finally {
                latch.countDown();
            }
        }, "KooMind-AudioInit");
        initThread.start();

        try {
            if (!latch.await(12, TimeUnit.SECONDS)) {
                Log.e(TAG, "timeout pipeline de áudio");
                abandon();
                return false;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            abandon();
            return false;
        }
        return ok.get();
    }

    private void resetSessionCounters() {
        speechStarted = false;
        hadSpeech = false;
        pcmBytesWritten = 0;
        readErrorCount = 0;
        zeroReadCount = 0;
        chunkCount = 0;
        maxRmsSeen = 0;
        sourceSwitchCount = 0;
        pipelineSwitchCount = 0;
        audioSourceLabel = "?";
        pipelineLabel = "?";
        initProbeLog.setLength(0);
        activePipeline = null;
        nextPipelineIndex = 1;
        nextFallbackIndex = 1;
        activeSampleRate = 8_000;
        ringSize = activeSampleRate * 2 * RING_SECONDS;
        ringBuffer = new byte[ringSize];
        ringWritePos = 0;
        ringFilled = 0;
    }

    private boolean runHelperMicOnlyPipeline() throws InterruptedException {
        pipelineLabel = "HELPER+MIC";
        logInitProbe("mode", "HELPER");
        activePipeline = ROUTE_PIPELINES[0];
        Log.i(TAG, "Pipeline Helper — MIC físico (sem AudioManager)");
        Thread.sleep(DELAY_AFTER_MODE_MS);

        RecordConfig[] chain = buildMicPhysicalChain();
        for (int i = 0; i < chain.length; i++) {
            nextFallbackIndex = i + 1;
            if (openRecorderAndStart(chain[i])) {
                Log.i(TAG, "Fonte Helper: " + chain[i].label);
                return true;
            }
            stopCaptureThread();
            closeFile();
        }
        Log.e(TAG, "Helper MIC falhou");
        return false;
    }

    private void logInitProbe(String tag, String result) {
        if (initProbeLog.length() > 0) {
            initProbeLog.append(' ');
        }
        initProbeLog.append(tag).append(':').append(result);
    }

    private boolean runSamsungPipelineAndRecord() throws InterruptedException {
        if (KoomindHelperBridge.shouldUseHelperRecordingMode(routeContext)) {
            return runHelperMicOnlyPipeline();
        }

        AudioManager am = (AudioManager) routeContext.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {
            Log.e(TAG, "AudioManager null");
            return false;
        }

        saveAudioRoute(am);
        audioRoutePrepared = true;

        try {
            for (int p = 0; p < ROUTE_PIPELINES.length; p++) {
                RoutePipeline pipeline = ROUTE_PIPELINES[p];
                applyRoutePipeline(am, pipeline);
                activePipeline = pipeline;
                pipelineLabel = pipeline.label;
                nextPipelineIndex = p + 1;
                Log.i(TAG, "Pipeline " + pipeline.label);

                RecordConfig[] chain = pipeline.chain;
                for (int i = 0; i < chain.length; i++) {
                    nextFallbackIndex = i + 1;
                    if (openRecorderAndStart(chain[i])) {
                        Log.i(TAG, "Fonte vencedora: " + chain[i].label
                                + " pipeline=" + pipeline.label);
                        return true;
                    }
                    stopCaptureThread();
                    closeFile();
                }
            }
            Log.e(TAG, "todas pipelines/fontes falharam");
            return false;
        } finally {
            if (!running) {
                restoreAudioRoute();
            }
        }
    }

    private void applyRoutePipeline(AudioManager am, RoutePipeline pipeline)
            throws InterruptedException {
        if (pipeline.skipAudioRouteChanges) {
            Log.i(TAG, "Pipeline " + pipeline.label
                    + " — sem alterar AudioManager (microfone físico)");
            Thread.sleep(DELAY_AFTER_MODE_MS);
            return;
        }
        am.setMode(pipeline.audioMode);
        Log.i(TAG, "AudioManager → mode=" + pipeline.audioMode);
        Thread.sleep(DELAY_AFTER_MODE_MS);

        if (pipeline.forceSpeaker) {
            applySpeakerRoute(am);
            Log.i(TAG, "Speakerphone → ON (+" + DELAY_AFTER_SPEAKER_MS + "ms)");
        } else {
            am.setSpeakerphoneOn(false);
            Log.i(TAG, "Speakerphone → OFF (+" + DELAY_AFTER_SPEAKER_MS + "ms)");
        }
        Thread.sleep(DELAY_AFTER_SPEAKER_MS);
    }

    private void applyActivePipelineRoute(AudioManager am) {
        if (activePipeline == null) {
            applyInCommunicationSpeakerRoute(am);
            return;
        }
        if (activePipeline.skipAudioRouteChanges) {
            return;
        }
        try {
            am.setMode(activePipeline.audioMode);
            if (activePipeline.forceSpeaker) {
                applySpeakerRoute(am);
            } else {
                am.setSpeakerphoneOn(false);
            }
        } catch (Exception e) {
            Log.w(TAG, "applyActivePipelineRoute", e);
        }
    }

    private void saveAudioRoute(AudioManager am) {
        audioRoutePrepared = false;
        savedAudioMode = am.getMode();
        savedSpeakerphone = am.isSpeakerphoneOn();
        savedVoiceCallVolume = am.getStreamVolume(AudioManager.STREAM_VOICE_CALL);
    }

    private static void applySpeakerRoute(AudioManager am) {
        am.setSpeakerphoneOn(true);
        int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL);
        am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, maxVol, 0);
    }

    private static void applyInCommunicationSpeakerRoute(AudioManager am) {
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        applySpeakerRoute(am);
    }

    private boolean openRecorderAndStart(RecordConfig config) {
        if (!prepareWavForSampleRate(config.sampleRate)) {
            return false;
        }
        audioSourceLabel = config.label;

        int minBuffer = AudioRecord.getMinBufferSize(
                activeSampleRate,
                CHANNEL,
                ENCODING
        );
        if (minBuffer <= 0) {
            logInitProbe(config.probeTag, "BUF");
            Log.w(TAG, "getMinBufferSize falhou rate=" + activeSampleRate);
            return false;
        }
        int readSize = Math.max(minBuffer, activeSampleRate / 5);

        AudioRecord record = createRecord(config, readSize);
        if (record == null) {
            return false;
        }

        audioRecord = record;
        running = true;
        final int chunkSize = readSize;
        readerThread = new Thread(() -> readLoop(chunkSize), "KooMind-VAD");
        readerThread.start();

        try {
            audioRecord.startRecording();
            Log.i(TAG, "startRecording " + config.label + " state=" + audioRecord.getRecordingState());
            return true;
        } catch (Exception e) {
            logInitProbe(config.probeTag, "START_ERR");
            Log.e(TAG, "startRecording", e);
            abandon();
            return false;
        }
    }

    private AudioRecord createRecord(RecordConfig config, int readSize) {
        try {
            AudioRecord record = new AudioRecord(
                    config.source,
                    config.sampleRate,
                    CHANNEL,
                    ENCODING,
                    readSize * 4
            );
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                logInitProbe(config.probeTag, "N/I");
                Log.w(TAG, config.probeTag + " rate=" + config.sampleRate + " → NOT_INITIALIZED");
                record.release();
                return null;
            }
            logInitProbe(config.probeTag, "OK");
            Log.i(TAG, config.probeTag + " rate=" + config.sampleRate + " → INITIALIZED");
            return record;
        } catch (Exception e) {
            logInitProbe(config.probeTag, "ERR");
            Log.w(TAG, "createRecord " + config.probeTag, e);
            return null;
        }
    }

    private boolean prepareWavForSampleRate(int sampleRate) {
        if (sampleRate == activeSampleRate && wavFile != null && pcmBytesWritten == 0) {
            return true;
        }
        try {
            closeFile();
            activeSampleRate = sampleRate;
            ringSize = activeSampleRate * 2 * RING_SECONDS;
            ringBuffer = new byte[ringSize];
            ringWritePos = 0;
            ringFilled = 0;
            pcmBytesWritten = 0;
            speechStarted = false;
            wavFile = new RandomAccessFile(outputPath, "rw");
            wavFile.setLength(0);
            wavFile.write(new byte[44]);
            return true;
        } catch (IOException e) {
            Log.e(TAG, "prepareWavForSampleRate", e);
            return false;
        }
    }

    private void readLoop(int chunkSize) {
        byte[] buffer = new byte[chunkSize];
        int logEvery = 0;
        int lastSwitchAt = 0;
        int lastPipelineSwitchAt = 0;

        while (running) {
            AudioRecord current = audioRecord;
            if (current == null) break;

            int read = current.read(buffer, 0, buffer.length);
            if (read < 0) {
                readErrorCount++;
                if (readErrorCount <= 8) {
                    Log.w(TAG, "read erro=" + read);
                }
                continue;
            }
            if (read == 0) {
                zeroReadCount++;
                continue;
            }
            chunkCount++;
            if (++logEvery >= 250) {
                logEvery = 0;
                Log.d(TAG, "vivo " + pipelineLabel + "/" + audioSourceLabel
                        + " chunks=" + chunkCount + " maxRms=" + (int) maxRmsSeen);
            }

            if (maxRmsSeen < SILENT_RMS
                    && chunkCount - lastPipelineSwitchAt >= SWITCH_PIPELINE_AFTER_CHUNKS
                    && nextPipelineIndex < ROUTE_PIPELINES.length) {
                lastPipelineSwitchAt = chunkCount;
                if (trySwitchPipelineFromReader(chunkSize)) {
                    lastSwitchAt = chunkCount;
                    continue;
                }
            }

            RecordConfig[] chain =
                    activePipeline != null ? activePipeline.chain : buildFallbackChain();
            if (maxRmsSeen < SILENT_RMS
                    && chunkCount - lastSwitchAt >= SWITCH_AFTER_CHUNKS
                    && nextFallbackIndex < chain.length) {
                lastSwitchAt = chunkCount;
                RecordConfig next = chain[nextFallbackIndex++];
                if (reopenAfterSwitchFromReader(next, chunkSize)) {
                    continue;
                }
            }

            processChunk(buffer, read);
        }
    }

    private boolean trySwitchPipelineFromReader(int readSize) {
        if (routeContext == null || nextPipelineIndex >= ROUTE_PIPELINES.length) {
            return false;
        }

        RoutePipeline nextPipe = ROUTE_PIPELINES[nextPipelineIndex++];
        RecordConfig[] chain = nextPipe.chain;
        Log.w(TAG, "PCM mudo — troca pipeline -> " + nextPipe.label);
        logInitProbe("pipe", nextPipe.label);

        releaseCurrentRecorder();

        try {
            AudioManager am = (AudioManager) routeContext.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                applyRoutePipeline(am, nextPipe);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            running = false;
            return false;
        } catch (Exception e) {
            Log.w(TAG, "switch pipeline route", e);
        }

        activePipeline = nextPipe;
        pipelineLabel = nextPipe.label;
        pipelineSwitchCount++;
        nextFallbackIndex = 0;

        for (int i = 0; i < chain.length; i++) {
            nextFallbackIndex = i + 1;
            if (reopenAfterSwitchFromReader(chain[i], readSize)) {
                return true;
            }
        }
        running = false;
        return false;
    }

    private void releaseCurrentRecorder() {
        AudioRecord old = audioRecord;
        audioRecord = null;
        if (old != null) {
            try {
                if (old.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    old.stop();
                }
            } catch (Exception ignored) {
            }
            try {
                old.release();
            } catch (Exception ignored) {
            }
        }
    }

    /** Continua no mesmo thread de leitura após trocar fonte ou pipeline. */
    private boolean reopenAfterSwitchFromReader(RecordConfig config, int readSize) {
        if (routeContext == null) return false;

        Log.w(TAG, "PCM mudo — troca fonte -> " + config.label);
        releaseCurrentRecorder();

        try {
            AudioManager am = (AudioManager) routeContext.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                applyActivePipelineRoute(am);
            }
        } catch (Exception e) {
            Log.w(TAG, "switch route", e);
        }

        if (!prepareWavForSampleRate(config.sampleRate)) {
            running = false;
            return false;
        }

        audioSourceLabel = config.label;

        int minBuffer = AudioRecord.getMinBufferSize(activeSampleRate, CHANNEL, ENCODING);
        if (minBuffer > 0) {
            readSize = Math.max(minBuffer, activeSampleRate / 5);
        }

        AudioRecord next = createRecord(config, readSize);
        if (next == null) {
            return false;
        }
        try {
            next.startRecording();
        } catch (Exception e) {
            logInitProbe(config.probeTag, "SW_ERR");
            Log.w(TAG, "switch start", e);
            next.release();
            return false;
        }
        sourceSwitchCount++;
        audioRecord = next;
        running = true;
        Log.i(TAG, "fonte ativa: " + config.label + " pipe=" + pipelineLabel);
        return true;
    }

    private void processChunk(byte[] data, int length) {
        byte[] boosted = applyGainIfQuiet(data, length);
        int sampleCount = boosted.length / 2;
        double rms = computeRms(boosted, sampleCount);
        if (rms > maxRmsSeen) {
            maxRmsSeen = rms;
        }
        if (rms >= SILENT_RMS) {
            hadSpeech = true;
        }

        if (!speechStarted && length > 0) {
            speechStarted = true;
            try {
                flushRingToFile();
                writePcm(boosted, boosted.length);
            } catch (IOException e) {
                Log.e(TAG, "write first", e);
            }
            return;
        }

        if (speechStarted) {
            try {
                writePcm(boosted, boosted.length);
            } catch (IOException e) {
                Log.e(TAG, "write pcm", e);
            }
        } else {
            ringWrite(boosted, boosted.length);
        }
    }

    private byte[] applyGainIfQuiet(byte[] data, int length) {
        if (length < 2) return data;
        int samples = length / 2;
        double rms = computeRms(data, samples);
        if (rms >= 400 || rms <= 0) return data;

        float gain = rms < 30 ? 4.0f : rms < 120 ? 2.5f : 1.5f;
        byte[] out = new byte[length];
        for (int i = 0; i < samples; i++) {
            int lo = data[i * 2] & 0xff;
            int hi = data[i * 2 + 1];
            int sample = (short) (lo | (hi << 8));
            int amplified = (int) (sample * gain);
            if (amplified > 32767) amplified = 32767;
            if (amplified < -32768) amplified = -32768;
            out[i * 2] = (byte) (amplified & 0xff);
            out[i * 2 + 1] = (byte) ((amplified >> 8) & 0xff);
        }
        return out;
    }

    private void ringWrite(byte[] data, int length) {
        int remaining = length;
        int offset = 0;
        while (remaining > 0) {
            int toWrite = Math.min(remaining, ringSize - ringWritePos);
            System.arraycopy(data, offset, ringBuffer, ringWritePos, toWrite);
            ringWritePos = (ringWritePos + toWrite) % ringSize;
            ringFilled = Math.min(ringSize, ringFilled + toWrite);
            offset += toWrite;
            remaining -= toWrite;
        }
    }

    private void flushRingToFile() throws IOException {
        if (ringFilled <= 0) return;
        if (ringFilled < ringSize) {
            writePcm(ringBuffer, 0, ringFilled);
            return;
        }
        int tail = ringSize - ringWritePos;
        if (tail > 0) {
            writePcm(ringBuffer, ringWritePos, tail);
        }
        if (ringWritePos > 0) {
            writePcm(ringBuffer, 0, ringWritePos);
        }
    }

    private void writePcm(byte[] data, int length) throws IOException {
        writePcm(data, 0, length);
    }

    private void writePcm(byte[] data, int offset, int length) throws IOException {
        if (wavFile == null) return;
        wavFile.write(data, offset, length);
        pcmBytesWritten += length;
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

    public boolean isActive() {
        return running;
    }

    public boolean hadSpeech() {
        return hadSpeech;
    }

    public long getPcmBytesWritten() {
        return pcmBytesWritten;
    }

    public double getMaxRmsSeen() {
        return maxRmsSeen;
    }

    public String getDiagnosticsSummary() {
        String probe = initProbeLog.length() > 0 ? initProbeLog.toString() : "?";
        return String.format(Locale.US,
                "pipe=%s | init:%s | %s | c=%d sw=%d ps=%d err=%d r0=%d maxRms=%.0f pcm=%d",
                pipelineLabel,
                probe,
                audioSourceLabel,
                chunkCount,
                sourceSwitchCount,
                pipelineSwitchCount,
                readErrorCount,
                zeroReadCount,
                maxRmsSeen,
                pcmBytesWritten
        );
    }

    public boolean stopAndFinalize() {
        try {
            stopCaptureThread();
            if (pcmBytesWritten < 8_000) {
                Log.w(TAG, "PCM curto: " + pcmBytesWritten + " " + getDiagnosticsSummary());
                deleteOutput();
                return false;
            }
            try {
                writeWavHeader(pcmBytesWritten);
                closeFile();
                Log.i(TAG, "WAV OK " + getDiagnosticsSummary());
                return true;
            } catch (IOException e) {
                Log.e(TAG, "wav header", e);
                deleteOutput();
                return false;
            }
        } finally {
            restoreAudioRoute();
        }
    }

    public void abandon() {
        try {
            stopCaptureThread();
            deleteOutput();
        } finally {
            restoreAudioRoute();
        }
    }

    private void stopCaptureThread() {
        running = false;
        releaseCurrentRecorder();
        if (readerThread != null) {
            try {
                readerThread.join(2000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            readerThread = null;
        }
    }

    public void restoreAudioRoute() {
        if (!audioRoutePrepared || routeContext == null) {
            audioRoutePrepared = false;
            return;
        }
        try {
            AudioManager am = (AudioManager) routeContext.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (savedVoiceCallVolume >= 0) {
                    am.setStreamVolume(
                            AudioManager.STREAM_VOICE_CALL,
                            savedVoiceCallVolume,
                            0
                    );
                }
                am.setSpeakerphoneOn(savedSpeakerphone);
                am.setMode(savedAudioMode);
            }
        } catch (Exception e) {
            Log.w(TAG, "restore route", e);
        }
        audioRoutePrepared = false;
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
        if (outputPath != null) {
            new File(outputPath).delete();
        }
    }

    private void writeWavHeader(long pcmLen) throws IOException {
        if (wavFile == null) return;
        int totalDataLen = (int) pcmLen + 36;
        int byteRate = activeSampleRate * 2;
        wavFile.seek(0);
        wavFile.writeBytes("RIFF");
        wavFile.writeInt(Integer.reverseBytes(totalDataLen));
        wavFile.writeBytes("WAVE");
        wavFile.writeBytes("fmt ");
        wavFile.writeInt(Integer.reverseBytes(16));
        wavFile.writeShort(Short.reverseBytes((short) 1));
        wavFile.writeShort(Short.reverseBytes((short) 1));
        wavFile.writeInt(Integer.reverseBytes(activeSampleRate));
        wavFile.writeInt(Integer.reverseBytes(byteRate));
        wavFile.writeShort(Short.reverseBytes((short) 2));
        wavFile.writeShort(Short.reverseBytes((short) 16));
        wavFile.writeBytes("data");
        wavFile.writeInt(Integer.reverseBytes((int) pcmLen));
    }
}
