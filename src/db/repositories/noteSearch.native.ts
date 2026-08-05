import { getDatabase } from '@/db/database.native';
import type { NoteSearchHit } from '@/db/repositories/noteSearch.types';
import { extractSearchSnippet } from '@/utils/noteSearch';
import type { CallSession, Note, NoteSource } from '@/types';
import { resolveCallNoteParts } from '@/utils/callNote';

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.note_id as string,
    contact_id: row.contact_id as string,
    call_session_id: (row.call_session_id as string) ?? null,
    body: row.note_body as string,
    source: row.note_source as NoteSource,
    created_at: row.note_created_at as number,
  };
}

function rowToSession(row: Record<string, unknown>): CallSession | null {
  if (!row.session_id) return null;
  return {
    id: row.session_id as string,
    contact_id: row.contact_id as string,
    phone: row.phone as string,
    direction: row.direction as CallSession['direction'],
    started_at: row.started_at as number,
    ended_at: (row.ended_at as number) ?? null,
    audio_uri: (row.audio_uri as string) ?? null,
    transcription_status: row.transcription_status as CallSession['transcription_status'],
    transcription_text: (row.transcription_text as string) ?? null,
  };
}

export async function searchNotesGlobally(
  query: string,
  limit = 50
): Promise<NoteSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const db = await getDatabase();
  const pattern = `%${q.toLowerCase()}%`;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
       c.id AS contact_id,
       c.name AS contact_name,
       c.phone_normalized,
       n.id AS note_id,
       n.body AS note_body,
       n.source AS note_source,
       n.created_at AS note_created_at,
       n.call_session_id,
       s.id AS session_id,
       s.phone,
       s.direction,
       s.started_at,
       s.ended_at,
       s.audio_uri,
       s.transcription_status,
       s.transcription_text
     FROM notes n
     INNER JOIN contacts c ON c.id = n.contact_id
     LEFT JOIN call_sessions s ON s.id = n.call_session_id
     WHERE LOWER(n.body) LIKE ?
        OR LOWER(s.transcription_text) LIKE ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    pattern,
    pattern,
    limit
  );

  return rows.map((row) => {
    const note = rowToNote(row);
    const session = rowToSession(row);
    const { transcription } = resolveCallNoteParts(
      note.body,
      session?.transcription_text
    );
    return {
      contactId: row.contact_id as string,
      contactName: row.contact_name as string,
      phoneNormalized: row.phone_normalized as string,
      noteId: note.id,
      noteCreatedAt: note.created_at,
      snippet: extractSearchSnippet(note, session ?? undefined, q),
      matchedInTranscription: Boolean(
        transcription.toLowerCase().includes(q.toLowerCase())
      ),
    };
  });
}
