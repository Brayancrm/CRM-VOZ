import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createCallSession,
  endCallSession,
  getCallSessionById,
} from '@/db/repositories/callSessions';
import { createNote, listNotesByContact } from '@/db/repositories/notes';
import type { CallDirection, Contact } from '@/types';
import { createId } from '@/utils/id';
import {
  startMicRecording,
  stopMicRecording,
  isRecording,
} from '@/services/recording';
import { enqueueTranscription } from '@/services/transcriptionQueue';
import {
  abandonNativeRecording,
  consumeNativeCallRecordingWithRetry,
  getNativeCallRecordingState,
  getRecordingLastError,
  updateNativeRecordingDisplayName,
  waitForNativeRecordingReleased,
  type FinishedNativeRecording,
} from '@/services/nativeCallRecording';
import { isAudioLargeEnoughForTranscription } from '@/utils/transcriptionGuards';
import {
  normalizeAudioUri,
  probeAudioPlayable,
  validateRecordingFile,
  validateRecordingForPlayback,
} from '@/utils/audioUri';
import { resolveContactForCall, resolvePhoneForCall } from '@/utils/phoneMatch';
import { reconcileCallSessionContact } from '@/services/callContactReconcile';

export type ActiveCallState = {
  sessionId: string;
  contactId: string;
  phone: string;
  direction: CallDirection;
  startedAt: number;
  usesNativeRecorder: boolean;
};

let activeCall: ActiveCallState | null = null;

export function getActiveCall(): ActiveCallState | null {
  return activeCall;
}

/** Limpa estado JS quando a ligação já terminou. */
export function clearActiveCallState(): void {
  activeCall = null;
}

export function isCallSessionActive(): boolean {
  return activeCall !== null;
}

/** @deprecated use isCallSessionActive */
export function isCallRecordingActive(): boolean {
  return isCallSessionActive();
}

/**
 * Identifica o contato e abre sessão de chamada — sem gravar áudio.
 * A nota é criada ao terminar a ligação (`finishCallWithNote`).
 */
export async function beginCallSession(params: {
  contact: Contact;
  phone: string;
  direction: CallDirection;
  nativeSessionId?: string;
}): Promise<string> {
  if (activeCall) {
    await finishCallWithNote();
  }

  const sessionId =
    params.nativeSessionId && params.nativeSessionId.length > 8
      ? params.nativeSessionId
      : createId();

  const existing = await getCallSessionById(sessionId);
  if (!existing) {
    await createCallSession({
      id: sessionId,
      contact_id: params.contact.id,
      phone: params.phone,
      direction: params.direction,
      started_at: Date.now(),
      ended_at: null,
      audio_uri: null,
      transcription_status: 'skipped',
      transcription_text: null,
    });
  }

  activeCall = {
    sessionId,
    contactId: params.contact.id,
    phone: params.phone,
    direction: params.direction,
    startedAt: Date.now(),
    usesNativeRecorder: false,
  };

  if (Platform.OS === 'android') {
    updateNativeRecordingDisplayName(params.contact.name);
  }

  return sessionId;
}

/** Encerra a sessão e cria nota vazia para o usuário escrever. */
export async function finishCallWithNote(): Promise<{
  sessionId: string;
  noteId: string;
  contactId: string;
} | null> {
  const snapshot = activeCall;
  if (!snapshot) return null;

  const { sessionId, contactId } = snapshot;
  activeCall = null;
  const ended_at = Date.now();

  await endCallSession(sessionId, {
    ended_at,
    audio_uri: null,
    transcription_status: 'skipped',
  });

  const existingNotes = await listNotesByContact(contactId);
  const existing = existingNotes.find((n) => n.call_session_id === sessionId);
  if (existing) {
    return { sessionId, noteId: existing.id, contactId };
  }

  const noteId = createId();
  await createNote({
    id: noteId,
    contact_id: contactId,
    call_session_id: sessionId,
    body: '',
    source: 'post_call',
    created_at: ended_at,
  });

  return { sessionId, noteId, contactId };
}

/** Troca gravação nativa (muda no Samsung) pelo microfone do app quando o usuário abre o KooMind. */
export async function tryHandoffNativeToExpoRecording(): Promise<boolean> {
  if (Platform.OS !== 'android' || !activeCall?.usesNativeRecorder) {
    return false;
  }
  const nativeState = await getNativeCallRecordingState();
  if (!nativeState?.recording) return false;

  const { sessionId, contactId, phone, direction, startedAt } = activeCall;
  await abandonNativeRecording();
  await waitForNativeRecordingReleased(4000);
  await new Promise((r) => setTimeout(r, 280));

  try {
    await startMicRecording(sessionId);
  } catch (e) {
    console.warn('KooMind: handoff para Expo falhou', e);
    return false;
  }

  activeCall = {
    sessionId,
    contactId,
    phone,
    direction,
    startedAt,
    usesNativeRecorder: false,
  };
  return true;
}

function toReadableUri(path: string, audioUri?: string): string {
  if (audioUri?.startsWith('file://')) return audioUri;
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}

async function copyNativeAudioToDocuments(
  sessionId: string,
  finished: FinishedNativeRecording
): Promise<{ uri: string; size: number } | null> {
  const sourceUri = toReadableUri(finished.audioPath, finished.audioUri);

  const dir = `${FileSystem.documentDirectory}recordings/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = finished.audioPath.toLowerCase().endsWith('.wav') ? 'wav' : 'm4a';
  const dest = `${dir}${sessionId}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
  } catch (e) {
    console.warn('KooMind: copyAsync falhou', e);
    return null;
  }

  const check = await validateRecordingFile(dest);
  if (!check.ok) {
    console.warn('KooMind: gravação inválida após cópia', check.reason, check.size);
    return null;
  }
  return { uri: check.normalizedUri, size: check.size };
}

async function attachNativeAudioToSession(
  sessionId: string,
  contactId: string,
  endedAt: number,
  finished: FinishedNativeRecording
): Promise<boolean> {
  const copied = await copyNativeAudioToDocuments(sessionId, finished);
  if (!copied?.uri) return false;

  const probe = await probeAudioPlayable(copied.uri);
  const storedUri = probe.ok ? probe.normalizedUri : copied.uri;
  const canTranscribe = isAudioLargeEnoughForTranscription(
    copied.size,
    probe.durationMs
  );

  const session = await getCallSessionById(sessionId);
  await endCallSession(sessionId, {
    ended_at: endedAt,
    audio_uri: storedUri,
    transcription_status:
      canTranscribe && session?.transcription_status !== 'done'
        ? 'pending'
        : session?.transcription_status ?? 'skipped',
  });

  if (canTranscribe && session?.transcription_status !== 'done') {
    const notes = await listNotesByContact(contactId);
    const note = notes.find((n) => n.call_session_id === sessionId);
    if (note) enqueueTranscription(sessionId, note.id);
  }
  return true;
}

/** Recupera WAV nativo quando a sessão ficou sem audio_uri (corrida Helper → JS). */
export async function repairCallSessionAudio(
  sessionId: string
): Promise<string | null> {
  const session = await getCallSessionById(sessionId);
  if (!session) return null;

  if (session.audio_uri) {
    const probe = await probeAudioPlayable(session.audio_uri);
    if (probe.ok) return probe.normalizedUri;
    const playback = await validateRecordingForPlayback(session.audio_uri);
    if (playback.ok) return playback.normalizedUri;
  }

  const finished = await consumeNativeCallRecordingWithRetry(6, 400);
  if (!finished?.audioPath || finished.sessionId !== sessionId) {
    return session.audio_uri;
  }

  const ok = await attachNativeAudioToSession(
    sessionId,
    session.contact_id,
    session.ended_at ?? Date.now(),
    finished
  );
  if (!ok) return session.audio_uri;

  const updated = await getCallSessionById(sessionId);
  return updated?.audio_uri ?? null;
}

export async function beginCallRecording(params: {
  contact: Contact;
  phone: string;
  direction: CallDirection;
}): Promise<string> {
  if (activeCall) {
    await finishCallRecording();
  }

  /** Com Telefone em cima o estado costuma ser «background» — só «active»/«inactive» evitam gravação nativa muda. */
  const preferExpoMic =
    Platform.OS === 'android' &&
    (AppState.currentState === 'active' || AppState.currentState === 'inactive');

  if (preferExpoMic) {
    await abandonNativeRecording();
    await waitForNativeRecordingReleased(4000);
    await new Promise((r) => setTimeout(r, 280));
  } else if (Platform.OS === 'android') {
    let nativeState = await getNativeCallRecordingState();
    if (!nativeState?.recording) {
      await new Promise((r) => setTimeout(r, 900));
      nativeState = await getNativeCallRecordingState();
    }
    if (nativeState?.recording && nativeState.sessionId) {
      const sessionId = nativeState.sessionId;
      const startedAt = nativeState.startedAt || Date.now();
      const existing = await getCallSessionById(sessionId);

      if (!existing) {
        await createCallSession({
          id: sessionId,
          contact_id: params.contact.id,
          phone: params.phone,
          direction: params.direction,
          started_at: startedAt,
          ended_at: null,
          audio_uri: null,
          transcription_status: 'pending',
          transcription_text: null,
        });
      }

      activeCall = {
        sessionId,
        contactId: params.contact.id,
        phone: params.phone,
        direction: params.direction,
        startedAt,
        usesNativeRecorder: true,
      };

      updateNativeRecordingDisplayName(params.contact.name);
      return sessionId;
    }
  }

  const sessionId = createId();
  await createCallSession({
    id: sessionId,
    contact_id: params.contact.id,
    phone: params.phone,
    direction: params.direction,
    started_at: Date.now(),
    ended_at: null,
    audio_uri: null,
    transcription_status: 'pending',
    transcription_text: null,
  });

  try {
    await startMicRecording(sessionId);
  } catch (e) {
    await endCallSession(sessionId, {
      ended_at: Date.now(),
      transcription_status: 'skipped',
    });
    throw e;
  }

  activeCall = {
    sessionId,
    contactId: params.contact.id,
    phone: params.phone,
    direction: params.direction,
    startedAt: Date.now(),
    usesNativeRecorder: false,
  };

  return sessionId;
}

async function finalizeSessionWithAudio(
  sessionId: string,
  contactId: string,
  ended_at: number,
  audio_uri: string | null,
  fileSize?: number,
  nativeError?: string
): Promise<{ sessionId: string; noteId: string; contactId: string }> {
  let storedUri = audio_uri ? normalizeAudioUri(audio_uri) : null;
  let probeDurationMs = 0;
  let playError = nativeError;

  if (storedUri) {
    const probe = await probeAudioPlayable(storedUri);
    if (probe.ok) {
      storedUri = probe.normalizedUri;
      probeDurationMs = probe.durationMs;
      fileSize = fileSize ?? (await validateRecordingFile(storedUri)).size;
    } else {
      const playback = await validateRecordingForPlayback(storedUri);
      if (playback.ok) {
        storedUri = playback.normalizedUri;
        probeDurationMs = Math.max(
          3000,
          ((playback.size - 44) / (16_000 * 2)) * 1000
        );
        fileSize = fileSize ?? playback.size;
      } else {
        storedUri = null;
        playError = probe.reason ?? playback.reason ?? playError;
      }
    }
  }

  const canTranscribe =
    Boolean(storedUri) &&
    isAudioLargeEnoughForTranscription(fileSize, probeDurationMs);

  await endCallSession(sessionId, {
    ended_at,
    audio_uri: storedUri,
    transcription_status: canTranscribe ? 'pending' : 'skipped',
  });

  let placeholder: string;
  if (canTranscribe) {
    placeholder =
      '[Transcrevendo sua fala… você pode editar ou usar Ouvir áudio.]';
  } else if (playError) {
    placeholder = `[${playError}]`;
  } else {
    placeholder =
      '[Áudio muito curto ou sem voz detectada — na próxima ligação use viva-voz ou fone com microfone, ou toque «Iniciar gravação» no contato.]';
  }

  const noteId = createId();
  await createNote({
    id: noteId,
    contact_id: contactId,
    call_session_id: sessionId,
    body: placeholder,
    source: 'call_mic',
    created_at: ended_at,
  });

  if (canTranscribe && storedUri) {
    enqueueTranscription(sessionId, noteId);
  }

  return { sessionId, noteId, contactId };
}

/** Gravação manual na tela pós-chamada quando a detecção automática não capturou voz. */
export async function attachPostCallRecording(
  sessionId: string,
  noteId: string,
  uri: string
): Promise<boolean> {
  const probe = await probeAudioPlayable(uri);
  if (!probe.ok) return false;

  const fileCheck = await validateRecordingFile(probe.normalizedUri);
  const session = await getCallSessionById(sessionId);
  const canTranscribe = isAudioLargeEnoughForTranscription(
    fileCheck.size,
    probe.durationMs
  );

  await endCallSession(sessionId, {
    ended_at: session?.ended_at ?? Date.now(),
    audio_uri: probe.normalizedUri,
    transcription_status: canTranscribe ? 'pending' : 'skipped',
  });

  if (canTranscribe) {
    enqueueTranscription(sessionId, noteId);
  }
  return canTranscribe;
}

async function finishFromNativePayload(
  finished: FinishedNativeRecording,
  contactId: string
): Promise<{ sessionId: string; noteId: string; contactId: string }> {
  const sessionId = finished.sessionId;
  const ended_at = finished.endedAt || Date.now();
  const copied = await copyNativeAudioToDocuments(sessionId, finished);
  const nativeError = copied ? '' : (await getRecordingLastError()) || '';

  return finalizeSessionWithAudio(
    sessionId,
    contactId,
    ended_at,
    copied?.uri ?? null,
    copied?.size ?? finished.fileSizeBytes,
    nativeError || undefined
  );
}

export async function finishCallRecording(): Promise<{
  sessionId: string;
  noteId: string;
  contactId: string;
} | null> {
  const snapshot = activeCall;
  if (!snapshot) return null;

  const { sessionId: sid, contactId: cid, usesNativeRecorder } = snapshot;
  activeCall = null;

  if (usesNativeRecorder) {
    const finished = await consumeNativeCallRecordingWithRetry(12, 600);
    if (!finished) {
      const ended_at = Date.now();
      const err = await getRecordingLastError();
      await endCallSession(sid, {
        ended_at,
        transcription_status: 'skipped',
      });
      const noteId = createId();
      const body = err
        ? `[${err}]`
        : '[Chamada sem áudio gravado — escreva sua nota manualmente.]';
      await createNote({
        id: noteId,
        contact_id: cid,
        call_session_id: sid,
        body,
        source: 'call_mic',
        created_at: ended_at,
      });
      return { sessionId: sid, noteId, contactId: cid };
    }
    return finishFromNativePayload(finished, cid);
  }

  const ended_at = Date.now();
  let audio_uri: string | null = null;
  let fileSize: number | undefined;

  if (isRecording()) {
    try {
      const result = await stopMicRecording();
      if (result?.sessionId === sid) {
        const check = await validateRecordingFile(result.uri);
        if (check.ok) {
          audio_uri = check.normalizedUri;
          fileSize = check.size;
        }
      }
    } catch (e) {
      console.warn('KooMind: encerrar gravação Expo', e);
    }
  }

  if (!audio_uri) {
    const finished = await consumeNativeCallRecordingWithRetry(8, 500);
    if (finished?.sessionId === sid) {
      return finishFromNativePayload(finished, cid);
    }
  }

  return finalizeSessionWithAudio(sid, cid, ended_at, audio_uri, fileSize);
}

export async function processOrphanNativeRecording(): Promise<{
  sessionId: string;
  noteId: string;
  contactId: string;
} | null> {
  if (activeCall) return null;

  const finished = await consumeNativeCallRecordingWithRetry(8, 500);
  if (!finished) return null;

  const existing = await getCallSessionById(finished.sessionId);

  if (existing?.ended_at) {
    if (existing.audio_uri || !finished.audioPath) return null;
    const attached = await attachNativeAudioToSession(
      finished.sessionId,
      existing.contact_id,
      existing.ended_at,
      finished
    );
    if (!attached) return null;
    const notes = await listNotesByContact(existing.contact_id);
    const note = notes.find((n) => n.call_session_id === finished.sessionId);
    if (!note) return null;
    return {
      sessionId: finished.sessionId,
      noteId: note.id,
      contactId: existing.contact_id,
    };
  }

  const phone = await resolvePhoneForCall(finished.phone);
  const { contact, phone: resolvedPhone } = await resolveContactForCall(
    phone || finished.phone
  );

  if (!existing) {
    await createCallSession({
      id: finished.sessionId,
      contact_id: contact.id,
      phone: resolvedPhone || contact.phone_normalized,
      direction: 'out',
      started_at: finished.startedAt || Date.now(),
      ended_at: null,
      audio_uri: null,
      transcription_status: 'pending',
      transcription_text: null,
    });
  }

  const result = await finishFromNativePayload(finished, contact.id);
  const fixed = await reconcileCallSessionContact(finished.sessionId);
  if (fixed) {
    return { ...result, contactId: fixed.contactId };
  }
  return result;
}
