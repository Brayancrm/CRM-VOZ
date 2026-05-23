import { createCallSession, endCallSession } from '@/db/repositories/callSessions';
import { createNote } from '@/db/repositories/notes';
import type { CallDirection, Contact } from '@/types';
import { createId } from '@/utils/id';
import {
  startMicRecording,
  stopMicRecording,
  isRecording,
} from '@/services/recording';
import { enqueueTranscription } from '@/services/transcriptionQueue';

export type ActiveCallState = {
  sessionId: string;
  contactId: string;
  phone: string;
  direction: CallDirection;
  startedAt: number;
};

let activeCall: ActiveCallState | null = null;

export function getActiveCall(): ActiveCallState | null {
  return activeCall;
}

export function isCallRecordingActive(): boolean {
  return activeCall !== null;
}

export async function beginCallRecording(params: {
  contact: Contact;
  phone: string;
  direction: CallDirection;
}): Promise<string> {
  if (activeCall) {
    await finishCallRecording();
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
  };

  return sessionId;
}

export async function finishCallRecording(): Promise<{
  sessionId: string;
  noteId: string;
  contactId: string;
} | null> {
  if (!activeCall) return null;

  const { sessionId, contactId } = activeCall;
  const ended_at = Date.now();
  let audio_uri: string | null = null;

  if (isRecording()) {
    const result = await stopMicRecording();
    if (result?.sessionId === sessionId) {
      audio_uri = result.uri;
    }
  }

  await endCallSession(sessionId, {
    ended_at,
    audio_uri,
    transcription_status: audio_uri ? 'pending' : 'skipped',
  });

  const placeholder = audio_uri
    ? '[Transcrevendo sua fala… você pode editar ou usar Ouvir áudio.]'
    : '[Chamada sem áudio gravado — escreva sua nota manualmente.]';

  const noteId = createId();
  await createNote({
    id: noteId,
    contact_id: contactId,
    call_session_id: sessionId,
    body: placeholder,
    source: 'call_mic',
    created_at: ended_at,
  });

  activeCall = null;

  if (audio_uri) {
    enqueueTranscription(sessionId, noteId);
  }

  return { sessionId, noteId, contactId };
}
