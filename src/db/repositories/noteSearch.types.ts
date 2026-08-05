export interface NoteSearchHit {
  contactId: string;
  contactName: string;
  phoneNormalized: string;
  noteId: string;
  noteCreatedAt: number;
  snippet: string;
  matchedInTranscription: boolean;
}
