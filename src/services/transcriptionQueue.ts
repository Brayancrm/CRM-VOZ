import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getCallSessionById,
  setCallSessionTranscriptionStatus,
  updateCallSessionTranscription,
  listSessionsAwaitingTranscription,
} from '@/db/repositories/callSessions';
import { listNotesByContact, updateNote } from '@/db/repositories/notes';
import {
  getTranscriptionApiUrl,
  getTranscriptionApiSecret,
  isTranscriptionConfigured,
} from '@/services/transcriptionConfig';

type QueueItem = { sessionId: string; noteId: string };

const memoryQueue: QueueItem[] = [];
let processing = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeTranscriptionQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function enqueueTranscription(sessionId: string, noteId: string): void {
  if (Platform.OS === 'web') return;
  if (memoryQueue.some((q) => q.sessionId === sessionId)) return;
  memoryQueue.push({ sessionId, noteId });
  void processTranscriptionQueue();
}

export async function retryTranscription(
  sessionId: string,
  noteId: string
): Promise<void> {
  await setCallSessionTranscriptionStatus(sessionId, 'pending');
  enqueueTranscription(sessionId, noteId);
}

async function applyTranscriptionToNote(
  contactId: string,
  noteId: string,
  text: string
): Promise<void> {
  const notes = await listNotesByContact(contactId);
  const note = notes.find((n) => n.id === noteId);
  if (!note) return;
  const isPlaceholder = note.body.startsWith('[');
  await updateNote(note.id, isPlaceholder ? text : `${note.body}\n\n${text}`);
}

async function transcribeSession(item: QueueItem): Promise<void> {
  const session = await getCallSessionById(item.sessionId);
  if (!session?.audio_uri) {
    await setCallSessionTranscriptionStatus(item.sessionId, 'skipped');
    return;
  }

  const baseUrl = await getTranscriptionApiUrl();
  const secret = await getTranscriptionApiSecret();

  await setCallSessionTranscriptionStatus(item.sessionId, 'processing');
  notify();

  const info = await FileSystem.getInfoAsync(session.audio_uri);
  if (!info.exists) {
    await setCallSessionTranscriptionStatus(item.sessionId, 'failed');
    notify();
    return;
  }

  const form = new FormData();
  form.append('file', {
    uri: session.audio_uri,
    name: `${item.sessionId}.m4a`,
    type: 'audio/m4a',
  } as unknown as Parameters<FormData['append']>[1]);

  const headers: Record<string, string> = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const res = await fetch(`${baseUrl}/api/transcribe`, {
    method: 'POST',
    headers,
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || `Servidor retornou ${res.status}`);
  }

  const text = String(data.text || '').trim();
  if (!text) {
    throw new Error('Transcrição vazia');
  }

  await updateCallSessionTranscription(item.sessionId, text, 'done');
  await applyTranscriptionToNote(session.contact_id, item.noteId, text);
}

export async function processTranscriptionQueue(): Promise<void> {
  if (processing || Platform.OS === 'web') return;
  if (!(await isTranscriptionConfigured())) return;

  processing = true;
  notify();

  try {
    while (memoryQueue.length > 0) {
      const item = memoryQueue.shift()!;
      try {
        await transcribeSession(item);
      } catch (e) {
        console.warn('CRM-VOZ transcrição falhou', e);
        await setCallSessionTranscriptionStatus(item.sessionId, 'failed');
      }
      notify();
    }

    const pending = await listSessionsAwaitingTranscription();
    for (const s of pending) {
      const notes = await listNotesByContact(s.contact_id);
      const note = notes.find((n) => n.call_session_id === s.id);
      if (!note) {
        await setCallSessionTranscriptionStatus(s.id, 'skipped');
        continue;
      }
      try {
        await transcribeSession({ sessionId: s.id, noteId: note.id });
      } catch (e) {
        console.warn('CRM-VOZ transcrição falhou', e);
        await setCallSessionTranscriptionStatus(s.id, 'failed');
      }
      notify();
    }
  } finally {
    processing = false;
    notify();
  }
}

export function isTranscriptionProcessing(): boolean {
  return processing;
}
