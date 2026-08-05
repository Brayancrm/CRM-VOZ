export const CALL_NOTE_TX_MARKER = '— Transcrição —';

export function extractTranscriptionFailure(body: string): string | null {
  const m = body.match(/\[Transcrição falhou:\s*([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

export function isPlaceholderLike(body: string): boolean {
  return (
    body.startsWith('[Transcrevendo') ||
    body.startsWith('[Chamada sem áudio') ||
    body.startsWith('[Transcrição falhou')
  );
}

export function parseCallNoteBody(body: string): {
  userNotes: string;
  transcription: string;
} {
  const trimmed = body.trim();
  if (!trimmed || isPlaceholderLike(trimmed)) {
    return { userNotes: '', transcription: '' };
  }

  const marker = `\n\n${CALL_NOTE_TX_MARKER}\n`;
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    return {
      userNotes: trimmed.slice(0, idx).trim(),
      transcription: trimmed.slice(idx + marker.length).trim(),
    };
  }

  if (trimmed.startsWith(`${CALL_NOTE_TX_MARKER}\n`)) {
    return {
      userNotes: '',
      transcription: trimmed.slice(CALL_NOTE_TX_MARKER.length + 1).trim(),
    };
  }

  return { userNotes: trimmed, transcription: '' };
}

export function formatCallNoteBody(
  userNotes: string,
  _transcription?: string
): string {
  const notes = userNotes.trim();
  if (!notes || isPlaceholderLike(notes)) return notes;
  return notes;
}

function stripTranscriptionFromUserNotes(
  userNotes: string,
  transcription: string
): string {
  const notes = userNotes.trim();
  const tx = transcription.trim();
  if (!notes || !tx) return notes;
  if (notes === tx) return '';
  if (notes.startsWith(tx)) {
    return notes.slice(tx.length).trim().replace(/^[\n\r]+/, '');
  }
  return notes;
}

/** Junta texto salvo na nota com transcrição da sessão (se ainda não estiver na nota). */
export function resolveCallNoteParts(
  body: string,
  sessionTranscription?: string | null
): { userNotes: string; transcription: string } {
  const parsed = parseCallNoteBody(body);
  const fromSession = sessionTranscription?.trim() || '';
  let transcription = parsed.transcription || fromSession;
  let userNotes = parsed.userNotes;

  if (isPlaceholderLike(body)) {
    userNotes = '';
  }

  if (fromSession) {
    userNotes = stripTranscriptionFromUserNotes(userNotes || body.trim(), fromSession);
    if (parsed.transcription && !parsed.userNotes) {
      userNotes = stripTranscriptionFromUserNotes(userNotes, parsed.transcription);
    }
    transcription = fromSession;
  } else if (parsed.transcription) {
    transcription = parsed.transcription;
  }

  if (!fromSession && !parsed.transcription && !isPlaceholderLike(body)) {
    userNotes = parsed.userNotes || body.trim();
    transcription = '';
  }

  return { userNotes: userNotes.trim(), transcription: transcription.trim() };
}

/** Texto para TTS: nota do utilizador + transcrição (sem placeholders). */
export function getNoteSpeakableText(
  body: string,
  sessionTranscription?: string | null
): string {
  const { userNotes, transcription } = resolveCallNoteParts(
    body,
    sessionTranscription
  );
  const parts = [userNotes, transcription]
    .map((p) => p.trim())
    .filter((p) => p && !isPlaceholderLike(p) && !p.startsWith('['));
  return parts.join('. ').trim();
}
