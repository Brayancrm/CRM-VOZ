import { Platform } from 'react-native';
import { createCallSession } from '@/db/repositories/callSessions';
import { createNote } from '@/db/repositories/notes';
import {
  bootstrapTranscriptionQueue,
  enqueueTranscription,
} from '@/services/transcriptionQueue';
import {
  normalizeAudioUri,
  probeAudioPlayable,
  validateRecordingFile,
} from '@/utils/audioUri';
import { isAudioLargeEnoughForTranscription } from '@/utils/transcriptionGuards';
import { createId } from '@/utils/id';
import type { Contact } from '@/types';

/** Prefixo de sessões criadas só na ficha do contato — não entram no fluxo GSM/Helper. */
export const VOICE_NOTE_SESSION_PREFIX = 'voice-note-';

export function isStandaloneVoiceNoteSession(sessionId: string): boolean {
  return sessionId.startsWith(VOICE_NOTE_SESSION_PREFIX);
}

export function newVoiceNoteSessionId(): string {
  return `${VOICE_NOTE_SESSION_PREFIX}${createId()}`;
}

/**
 * Nota manual com áudio opcional — caminho isolado da detecção de chamada.
 * Reutiliza call_sessions + fila de transcrição sem tocar em callFlow nativo.
 */
export async function createStandaloneVoiceNote(
  contact: Contact,
  options: { body?: string; audioUri: string; sessionId?: string }
): Promise<{ noteId: string; sessionId: string; transcribe: boolean }> {
  if (Platform.OS === 'web') {
    throw new Error('Gravação de voz disponível só no celular.');
  }

  const sessionId =
    options.sessionId && isStandaloneVoiceNoteSession(options.sessionId)
      ? options.sessionId
      : newVoiceNoteSessionId();

  const probe = await probeAudioPlayable(options.audioUri);
  if (!probe.ok) {
    throw new Error(probe.reason ?? 'Áudio inválido.');
  }

  const fileCheck = await validateRecordingFile(probe.normalizedUri);
  const canTranscribe = isAudioLargeEnoughForTranscription(
    fileCheck.size,
    probe.durationMs
  );

  const now = Date.now();
  const storedUri = normalizeAudioUri(probe.normalizedUri);
  const userText = options.body?.trim() ?? '';

  await createCallSession({
    id: sessionId,
    contact_id: contact.id,
    phone: contact.phone_normalized,
    direction: 'out',
    started_at: now,
    ended_at: now,
    audio_uri: storedUri,
    transcription_status: canTranscribe ? 'pending' : 'skipped',
    transcription_text: null,
  });

  let noteBody: string;
  if (userText) {
    noteBody = userText;
  } else if (canTranscribe) {
    noteBody =
      '[Transcrevendo sua fala… você pode editar ou usar Ouvir áudio.]';
  } else {
    noteBody =
      fileCheck.reason ??
      '[Áudio muito curto — fale por mais tempo e tente de novo.]';
  }

  const noteId = createId();
  await createNote({
    id: noteId,
    contact_id: contact.id,
    call_session_id: sessionId,
    body: noteBody,
    source: 'voice',
    created_at: now,
  });

  if (canTranscribe) {
    enqueueTranscription(sessionId, noteId);
    void bootstrapTranscriptionQueue();
  }

  return { noteId, sessionId, transcribe: canTranscribe };
}
