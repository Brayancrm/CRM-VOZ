import { getDatabase } from '@/db/database.native';
import type { Note, NoteSource } from '@/types';

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    contact_id: row.contact_id as string,
    call_session_id: (row.call_session_id as string) ?? null,
    body: row.body as string,
    source: row.source as NoteSource,
    created_at: row.created_at as number,
  };
}

export async function listNotesByContact(contactId: string): Promise<Note[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM notes WHERE contact_id = ? ORDER BY created_at DESC`,
    contactId
  );
  return rows.map(rowToNote);
}

export async function createNote(note: Note): Promise<Note> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO notes (id, contact_id, call_session_id, body, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    note.id,
    note.contact_id,
    note.call_session_id,
    note.body,
    note.source,
    note.created_at
  );
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM notes WHERE id = ?`, id);
}

export async function updateNote(id: string, body: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE notes SET body = ? WHERE id = ?`, body.trim(), id);
}

export async function getCombinedHistoryText(contactId: string): Promise<string> {
  const notes = await listNotesByContact(contactId);
  if (notes.length === 0) return 'Nenhuma nota registrada para este contato.';
  return notes
    .map(
      (n, i) =>
        `Nota ${i + 1}, ${new Date(n.created_at).toLocaleString('pt-BR')}: ${n.body}`
    )
    .join('\n\n');
}
