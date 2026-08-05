import type { CallSession, TranscriptionStatus } from '@/types';
import {
  webCreateCallSession,
  webEndCallSession,
  webGetCallSessionById,
  webListSessionsByContact,
  webUpdateCallSessionTranscription,
  webSetCallSessionTranscriptionStatus,
  webListSessionsAwaitingTranscription,
} from '@/db/webStore';

export async function createCallSession(
  session: CallSession
): Promise<CallSession> {
  return webCreateCallSession(session);
}

export async function updateCallSessionContact(
  id: string,
  data: { contact_id: string; phone: string }
): Promise<void> {
  const session = await webGetCallSessionById(id);
  if (!session) return;
  await webCreateCallSession({ ...session, contact_id: data.contact_id, phone: data.phone });
}

export async function endCallSession(
  id: string,
  data: {
    ended_at: number;
    audio_uri?: string | null;
    transcription_status?: TranscriptionStatus;
  }
): Promise<void> {
  return webEndCallSession(id, data);
}

export async function updateCallSessionTranscription(
  id: string,
  text: string,
  status: TranscriptionStatus = 'done'
): Promise<void> {
  return webUpdateCallSessionTranscription(id, text, status);
}

export async function getCallSessionById(
  id: string
): Promise<CallSession | null> {
  return webGetCallSessionById(id);
}

export async function listSessionsByContact(
  contactId: string
): Promise<CallSession[]> {
  return webListSessionsByContact(contactId);
}

export async function setCallSessionTranscriptionStatus(
  id: string,
  status: TranscriptionStatus
): Promise<void> {
  return webSetCallSessionTranscriptionStatus(id, status);
}

export async function listSessionsAwaitingTranscription(): Promise<
  CallSession[]
> {
  return webListSessionsAwaitingTranscription();
}
