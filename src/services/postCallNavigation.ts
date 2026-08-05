import type { Router } from 'expo-router';
import { getCallSessionById } from '@/db/repositories/callSessions';
import { listNotesByContact, createNote } from '@/db/repositories/notes';
import { clearActiveCallState, finishCallWithNote } from '@/services/callFlow';
import { reconcileCallSessionContact } from '@/services/callContactReconcile';
import { bringAppToForeground } from '@/services/nativeCallRecording';
import type { CallEndedPayload } from '@/services/callOrchestrator';
import { createId } from '@/utils/id';
import { resolveContactForCall } from '@/utils/phoneMatch';
import {
  createCallSession,
  endCallSession,
} from '@/db/repositories/callSessions';

const DEDUP_MS = 15_000;
let lastNavSessionId = '';
let lastNavAt = 0;
let navInFlight: Promise<void> | null = null;

function shouldSkipDuplicate(sessionId: string): boolean {
  const now = Date.now();
  if (lastNavSessionId === sessionId && now - lastNavAt < DEDUP_MS) {
    return true;
  }
  lastNavSessionId = sessionId;
  lastNavAt = now;
  return false;
}

export function markPostCallNavigationHandled(sessionId: string): void {
  lastNavSessionId = sessionId;
  lastNavAt = Date.now();
}

/** Abre pós-chamada quando o nativo já tem sessionId (app em background). */
export async function openPostCallFromNativeSession(
  sessionId: string
): Promise<CallEndedPayload | null> {
  if (!sessionId) return null;

  let session = await getCallSessionById(sessionId);
  if (!session) {
    const fromActive = await finishCallWithNote();
    if (fromActive?.sessionId === sessionId) return fromActive;

    const { contact, phone } = await resolveContactForCall(undefined);
    await createCallSession({
      id: sessionId,
      contact_id: contact.id,
      phone: phone || contact.phone_normalized,
      direction: 'out',
      started_at: Date.now() - 60_000,
      ended_at: Date.now(),
      audio_uri: null,
      transcription_status: 'skipped',
      transcription_text: null,
    });
    await endCallSession(sessionId, {
      ended_at: Date.now(),
      transcription_status: 'skipped',
    });
    session = await getCallSessionById(sessionId);
  }

  if (!session) return null;

  const fixed = await reconcileCallSessionContact(sessionId);
  const contactId = fixed?.contactId ?? session.contact_id;
  const notes = await listNotesByContact(contactId);
  let note = notes.find((n) => n.call_session_id === sessionId);
  if (!note) {
    const noteId = createId();
    await createNote({
      id: noteId,
      contact_id: contactId,
      call_session_id: sessionId,
      body: '',
      source: 'post_call',
      created_at: session.ended_at ?? Date.now(),
    });
    return { sessionId, noteId, contactId };
  }

  return {
    sessionId,
    noteId: note.id,
    contactId,
  };
}

export async function openPostCallScreen(
  router: Router,
  sessionId: string
): Promise<void> {
  if (!sessionId || shouldSkipDuplicate(sessionId)) return;

  clearActiveCallState();

  if (navInFlight) {
    await navInFlight;
    return;
  }

  navInFlight = (async () => {
    bringAppToForeground();

    const payload = await openPostCallFromNativeSession(sessionId);
    if (!payload) return;

    router.replace({
      pathname: '/post-call/[sessionId]',
      params: {
        sessionId: payload.sessionId,
        contactId: payload.contactId,
        noteId: payload.noteId,
      },
    });
  })();

  try {
    await navInFlight;
  } finally {
    navInFlight = null;
  }
}

/** Extrai sessionId de deep link …/post-call/{id} */
export function parsePostCallSessionId(url: string): string | null {
  try {
    const match = url.match(/post-call\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
