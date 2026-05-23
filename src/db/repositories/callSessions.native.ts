import { getDatabase } from '@/db/database.native';
import type { CallSession, CallDirection, TranscriptionStatus } from '@/types';

function rowToSession(row: Record<string, unknown>): CallSession {
  return {
    id: row.id as string,
    contact_id: row.contact_id as string,
    phone: row.phone as string,
    direction: row.direction as CallDirection,
    started_at: row.started_at as number,
    ended_at: (row.ended_at as number) ?? null,
    audio_uri: (row.audio_uri as string) ?? null,
    transcription_status: row.transcription_status as TranscriptionStatus,
    transcription_text: (row.transcription_text as string) ?? null,
  };
}

export async function createCallSession(
  session: CallSession
): Promise<CallSession> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO call_sessions (
      id, contact_id, phone, direction, started_at, ended_at,
      audio_uri, transcription_status, transcription_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    session.contact_id,
    session.phone,
    session.direction,
    session.started_at,
    session.ended_at,
    session.audio_uri,
    session.transcription_status,
    session.transcription_text
  );
  return session;
}

export async function endCallSession(
  id: string,
  data: {
    ended_at: number;
    audio_uri?: string | null;
    transcription_status?: TranscriptionStatus;
  }
): Promise<void> {
  const db = await getDatabase();
  const current = await getCallSessionById(id);
  if (!current) return;
  await db.runAsync(
    `UPDATE call_sessions SET ended_at = ?, audio_uri = ?, transcription_status = ?
     WHERE id = ?`,
    data.ended_at,
    data.audio_uri ?? current.audio_uri,
    data.transcription_status ?? current.transcription_status,
    id
  );
}

export async function updateCallSessionTranscription(
  id: string,
  text: string,
  status: TranscriptionStatus = 'done'
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE call_sessions SET transcription_text = ?, transcription_status = ? WHERE id = ?`,
    text,
    status,
    id
  );
}

export async function getCallSessionById(
  id: string
): Promise<CallSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM call_sessions WHERE id = ?`,
    id
  );
  return row ? rowToSession(row) : null;
}

export async function listSessionsByContact(
  contactId: string
): Promise<CallSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM call_sessions WHERE contact_id = ? ORDER BY started_at DESC`,
    contactId
  );
  return rows.map(rowToSession);
}

export async function setCallSessionTranscriptionStatus(
  id: string,
  status: TranscriptionStatus
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE call_sessions SET transcription_status = ? WHERE id = ?`,
    status,
    id
  );
}

export async function listSessionsAwaitingTranscription(): Promise<
  CallSession[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM call_sessions
     WHERE audio_uri IS NOT NULL
       AND transcription_status IN ('pending', 'failed')
     ORDER BY ended_at ASC`
  );
  return rows.map(rowToSession);
}
