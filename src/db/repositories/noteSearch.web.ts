import type { NoteSearchHit } from '@/db/repositories/noteSearch.types';
import { extractSearchSnippet } from '@/utils/noteSearch';
import { resolveCallNoteParts } from '@/utils/callNote';
import {
  initWebStore,
  webGetCallSessionById,
  webListContacts,
  webListNotesByContact,
} from '@/db/webStore';

export async function searchNotesGlobally(
  query: string,
  limit = 50
): Promise<NoteSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  await initWebStore();
  const contacts = await webListContacts();
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const hits: NoteSearchHit[] = [];

  for (const contact of contacts) {
    if (hits.length >= limit) break;
    const notes = await webListNotesByContact(contact.id);
    for (const note of notes) {
      if (hits.length >= limit) break;

      const session = note.call_session_id
        ? await webGetCallSessionById(note.call_session_id)
        : null;
      const { userNotes, transcription } = resolveCallNoteParts(
        note.body,
        session?.transcription_text
      );
      const haystack = [userNotes, transcription, note.body]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(q)) continue;

      hits.push({
        contactId: contact.id,
        contactName: contact.name,
        phoneNormalized: contact.phone_normalized,
        noteId: note.id,
        noteCreatedAt: note.created_at,
        snippet: extractSearchSnippet(note, session ?? undefined, query),
        matchedInTranscription: transcription.toLowerCase().includes(q),
      });
    }
  }

  return hits.sort((a, b) => b.noteCreatedAt - a.noteCreatedAt).slice(0, limit);
}
