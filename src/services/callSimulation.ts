/**
 * Simulação manual (WhatsApp / teste) — mesma gravação da Fase 3, sem detecção de linha.
 */
import type { Contact } from '@/types';
import {
  beginCallRecording,
  finishCallRecording,
  getActiveCall,
  isCallRecordingActive,
} from '@/services/callFlow';

const activeSimulations = new Map<string, string>();

export async function simulateCallStart(contact: Contact): Promise<string> {
  if (isCallRecordingActive() && !activeSimulations.has(contact.id)) {
    throw new Error(
      'Há uma gravação de ligação real em andamento. Encerre a chamada antes de simular.'
    );
  }
  const sessionId = await beginCallRecording({
    contact,
    phone: contact.phone_normalized,
    direction: 'out',
  });
  activeSimulations.set(contact.id, sessionId);
  return sessionId;
}

export async function simulateCallEnd(
  contact: Contact,
  sessionId: string
): Promise<{ sessionId: string; noteId: string }> {
  const active = getActiveCall();
  if (!active || active.sessionId !== sessionId) {
    throw new Error('Sessão de simulação não encontrada.');
  }
  const result = await finishCallRecording();
  activeSimulations.delete(contact.id);
  if (!result) {
    throw new Error('Falha ao encerrar gravação.');
  }
  return { sessionId: result.sessionId, noteId: result.noteId };
}

export function getActiveSimulationSession(
  contactId: string
): string | undefined {
  const sim = activeSimulations.get(contactId);
  if (sim && getActiveCall()?.sessionId === sim) return sim;
  return undefined;
}
