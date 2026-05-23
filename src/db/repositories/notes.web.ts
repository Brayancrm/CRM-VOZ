import type { Note } from '@/types';
import {
  webListNotesByContact,
  webCreateNote,
  webDeleteNote,
  webUpdateNote,
} from '@/db/webStore';

export async function listNotesByContact(contactId: string): Promise<Note[]> {
  return webListNotesByContact(contactId);
}

export async function createNote(note: Note): Promise<Note> {
  return webCreateNote(note);
}

export async function deleteNote(id: string): Promise<void> {
  return webDeleteNote(id);
}

export async function updateNote(id: string, body: string): Promise<void> {
  return webUpdateNote(id, body);
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
