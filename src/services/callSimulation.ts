/**
 * Simulação manual (WhatsApp / teste) — mesma gravação da Fase 3, sem detecção de linha.
 */
import type { Contact } from '@/types';
import {
  beginCallRecording,
  finishCallRecording,
  getActiveCall,
  processOrphanNativeRecording,
} from '@/services/callFlow';

const activeSimulations = new Map<string, string>();

export async function simulateCallStart(contact: Contact): Promise<string> {
  const active = getActiveCall();
  if (active) {
    if (active.contactId === contact.id) {
      /* Mantém gravação nativa/ACR — não troca para Expo na ligação GSM. */
      activeSimulations.set(contact.id, active.sessionId);
      return active.sessionId;
    }
    throw new Error(
      'Há outra gravação em andamento. Encerre a chamada ou use o mesmo contato.'
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
    const orphan = await processOrphanNativeRecording();
    activeSimulations.delete(contact.id);
    if (orphan && orphan.sessionId === sessionId) {
      return { sessionId: orphan.sessionId, noteId: orphan.noteId };
    }
    throw new Error(
      'Ligação já encerrada — aguarde a tela pós-chamada ou abra a notificação.'
    );
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
