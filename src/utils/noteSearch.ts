import type { CallSession, Note } from '@/types';
import { resolveCallNoteParts } from '@/utils/callNote';
import {
  getDayWindow,
  getMonthWindow,
  getWeekWindow,
} from '@/utils/date';

export type NoteDateFilter = 'all' | 'today' | 'week' | 'month' | 'day';

export type ContactNoteSearchFilters = {
  query?: string;
  dateFilter?: NoteDateFilter;
  customDay?: Date;
};

export function getNoteDateRange(
  filter: NoteDateFilter,
  customDay = new Date()
): { start: number; end: number } | null {
  switch (filter) {
    case 'today':
      return getDayWindow(new Date());
    case 'week':
      return getWeekWindow(new Date());
    case 'month':
      return getMonthWindow(new Date());
    case 'day':
      return getDayWindow(customDay);
    default:
      return null;
  }
}

/** Texto indexável: nota + transcrição (corpo ou sessão). */
export function buildNoteSearchableText(
  note: Note,
  session?: CallSession | null
): string {
  const { userNotes, transcription } = resolveCallNoteParts(
    note.body,
    session?.transcription_text
  );
  return [userNotes, transcription, note.body]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function noteMatchesQuery(
  note: Note,
  session: CallSession | undefined,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return buildNoteSearchableText(note, session).includes(q);
}

export function noteMatchesDateRange(
  note: Note,
  range: { start: number; end: number } | null
): boolean {
  if (!range) return true;
  return note.created_at >= range.start && note.created_at <= range.end;
}

export function filterContactNotes(
  notes: Note[],
  sessions: CallSession[],
  filters: ContactNoteSearchFilters
): Note[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const range = getNoteDateRange(
    filters.dateFilter ?? 'all',
    filters.customDay
  );
  const query = filters.query?.trim() ?? '';

  return notes.filter((note) => {
    const session = note.call_session_id
      ? sessionById.get(note.call_session_id)
      : undefined;
    return (
      noteMatchesQuery(note, session, query) &&
      noteMatchesDateRange(note, range)
    );
  });
}

export function extractSearchSnippet(
  note: Note,
  session: CallSession | undefined,
  query: string,
  maxLen = 120
): string {
  const q = query.trim().toLowerCase();
  const { userNotes, transcription } = resolveCallNoteParts(
    note.body,
    session?.transcription_text
  );
  const parts = [userNotes, transcription].filter(Boolean);
  const combined = parts.join(' · ') || note.body;
  if (!q) {
    return combined.length > maxLen
      ? `${combined.slice(0, maxLen)}…`
      : combined;
  }
  const lower = combined.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) {
    return combined.length > maxLen
      ? `${combined.slice(0, maxLen)}…`
      : combined;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(combined.length, idx + q.length + 60);
  let snippet = combined.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < combined.length) snippet = `${snippet}…`;
  return snippet;
}

export function hasActiveNoteFilters(
  filters: ContactNoteSearchFilters
): boolean {
  return Boolean(
    filters.query?.trim() ||
      (filters.dateFilter && filters.dateFilter !== 'all')
  );
}
