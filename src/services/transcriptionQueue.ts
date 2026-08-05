import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getCallSessionById,
  setCallSessionTranscriptionStatus,
  updateCallSessionTranscription,
  listSessionsAwaitingTranscription,
  resetStaleTranscriptionJobs,
} from '@/db/repositories/callSessions';
import { listNotesByContact, updateNote } from '@/db/repositories/notes';
import {
  getTranscriptionApiUrl,
  getTranscriptionApiSecret,
  isTranscriptionConfigured,
} from '@/services/transcriptionConfig';

import {
  isPlaceholderLike,
  parseCallNoteBody,
} from '@/utils/callNote';
import {
  isAudioLargeEnoughForTranscription,
  isLikelySilentTranscription,
} from '@/utils/transcriptionGuards';
import { probeAudioPlayable, validateRecordingFile } from '@/utils/audioUri';

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

  let userNotes = parseCallNoteBody(note.body).userNotes;
  if (isPlaceholderLike(note.body)) {
    userNotes = '';
  } else if (!userNotes && note.body.trim() === text.trim()) {
    userNotes = '';
  } else if (userNotes) {
    userNotes = userNotes.replace(text, '').trim();
  }

  const cleaned = userNotes.trim();
  if (note.body.trim() !== cleaned) {
    await updateNote(note.id, cleaned);
  }
}

async function applyTranscriptionFailureToNote(
  contactId: string,
  noteId: string,
  message: string
): Promise<void> {
  const notes = await listNotesByContact(contactId);
  const note = notes.find((n) => n.id === noteId);
  if (!note || note.body.includes('Transcrição falhou')) return;

  const line = `[Transcrição falhou: ${message}]`;
  if (isPlaceholderLike(note.body)) {
    await updateNote(note.id, line);
    return;
  }

  const { userNotes } = parseCallNoteBody(note.body);
  await updateNote(note.id, userNotes ? `${userNotes}\n\n${line}` : line);
}

function normalizeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

async function uploadAudioForTranscription(
  baseUrl: string,
  audioUri: string,
  _sessionId: string,
  secret: string
): Promise<{ text: string }> {
  const headers: Record<string, string> = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const fileUri = normalizeFileUri(audioUri);
  const uploadResult = await FileSystem.uploadAsync(
    `${baseUrl.replace(/\/$/, '')}/api/transcribe`,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: audioUri.toLowerCase().includes('.wav')
        ? 'audio/wav'
        : 'audio/m4a',
      headers,
    }
  );

  let data: { text?: string; error?: string };
  try {
    data = JSON.parse(uploadResult.body || '{}') as {
      text?: string;
      error?: string;
    };
  } catch {
    const snippet = (uploadResult.body || '').slice(0, 120);
    throw new Error(
      `Resposta inválida do servidor (${uploadResult.status}): ${snippet}`
    );
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(data.error || `Servidor retornou ${uploadResult.status}`);
  }

  const text = String(data.text || '').trim();
  if (!text) {
    throw new Error(
      'O áudio não contém voz detectável — fale em viva-voz ou use fone com microfone'
    );
  }
  if (isLikelySilentTranscription(text)) {
    throw new Error(
      'não foi detectada fala no áudio — use fone ou aproxime o microfone'
    );
  }

  return { text };
}

/** Transcreve um ficheiro local (complemento de voz / nota avulsa). */
export async function transcribeAudioUri(audioUri: string): Promise<string> {
  const configured = await isTranscriptionConfigured();
  if (!configured) {
    throw new Error('Servidor SeCretina não configurado neste build');
  }
  const baseUrl = await getTranscriptionApiUrl();
  const secret = await getTranscriptionApiSecret();
  const probe = await probeAudioPlayable(audioUri);
  if (!probe.ok) {
    throw new Error(probe.reason ?? 'Áudio inválido');
  }
  const fileCheck = await validateRecordingFile(probe.normalizedUri);
  if (!isAudioLargeEnoughForTranscription(fileCheck.size, probe.durationMs)) {
    throw new Error('Áudio muito curto — fale por alguns segundos');
  }
  const { text } = await uploadAudioForTranscription(
    baseUrl,
    probe.normalizedUri,
    'voice-supplement',
    secret
  );
  return text;
}

async function transcribeSession(item: QueueItem): Promise<void> {
  const session = await getCallSessionById(item.sessionId);
  if (!session?.audio_uri) {
    await setCallSessionTranscriptionStatus(item.sessionId, 'skipped');
    return;
  }

  const configured = await isTranscriptionConfigured();
  if (!configured) {
    throw new Error(
      'Servidor SeCretina não configurado neste build'
    );
  }

  const baseUrl = await getTranscriptionApiUrl();
  const secret = await getTranscriptionApiSecret();

  await setCallSessionTranscriptionStatus(item.sessionId, 'processing');
  notify();

  const probe = await probeAudioPlayable(session.audio_uri);
  if (!probe.ok) {
    await setCallSessionTranscriptionStatus(item.sessionId, 'skipped');
    await applyTranscriptionFailureToNote(
      session.contact_id,
      item.noteId,
      probe.reason ?? 'gravação inválida'
    );
    return;
  }
  const fileCheck = await validateRecordingFile(probe.normalizedUri);
  const fileSize = fileCheck.size;
  if (!isAudioLargeEnoughForTranscription(fileSize, probe.durationMs)) {
    await setCallSessionTranscriptionStatus(item.sessionId, 'skipped');
    await applyTranscriptionFailureToNote(
      session.contact_id,
      item.noteId,
      'áudio muito curto — fale mais perto do microfone na próxima ligação'
    );
    return;
  }

  const { text } = await uploadAudioForTranscription(
    baseUrl,
    probe.normalizedUri,
    item.sessionId,
    secret
  );

  await updateCallSessionTranscription(item.sessionId, text, 'done');
  await applyTranscriptionToNote(session.contact_id, item.noteId, text);
}

export async function bootstrapTranscriptionQueue(): Promise<void> {
  if (Platform.OS === 'web') return;
  await resetStaleTranscriptionJobs();
  await processTranscriptionQueue();
}

export async function processTranscriptionQueue(): Promise<void> {
  if (processing || Platform.OS === 'web') return;

  processing = true;
  notify();

  try {
    while (memoryQueue.length > 0) {
      const item = memoryQueue.shift()!;
      try {
        await transcribeSession(item);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        console.warn('CRM-VOZ transcrição falhou', msg);
        await setCallSessionTranscriptionStatus(item.sessionId, 'failed');
        const session = await getCallSessionById(item.sessionId);
        if (session) {
          await applyTranscriptionFailureToNote(
            session.contact_id,
            item.noteId,
            msg
          );
        }
      }
      notify();
    }

    if (!(await isTranscriptionConfigured())) return;

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
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        console.warn('CRM-VOZ transcrição falhou', msg);
        await setCallSessionTranscriptionStatus(s.id, 'failed');
        await applyTranscriptionFailureToNote(s.contact_id, note.id, msg);
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
