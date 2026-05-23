import type { PhoneCallEvent } from '@/services/callDetector/types';
import {
  beginCallRecording,
  finishCallRecording,
  getActiveCall,
  isCallRecordingActive,
} from '@/services/callFlow';
import { resolveContactForCall } from '@/utils/phoneMatch';
import {
  showRecordingNotification,
  dismissRecordingNotification,
} from '@/services/callRecordingNotification';

export type CallEndedPayload = {
  sessionId: string;
  noteId: string;
  contactId: string;
};

let lineEngaged = false;
let lastPhone: string | undefined;
let onCallEndedHandler: ((payload: CallEndedPayload) => void) | null = null;

export function setOnCallEnded(
  handler: ((payload: CallEndedPayload) => void) | null
): void {
  onCallEndedHandler = handler;
}

export function resetCallOrchestrator(): void {
  lineEngaged = false;
  lastPhone = undefined;
}

export async function handlePhoneEvent(
  event: PhoneCallEvent,
  phone?: string
): Promise<void> {
  if (phone) lastPhone = phone;

  if (event === 'Offhook') {
    if (lineEngaged || isCallRecordingActive()) return;
    lineEngaged = true;
    try {
      const { contact } = await resolveContactForCall(lastPhone);
      await beginCallRecording({
        contact,
        phone: contact.phone_normalized,
        direction: 'in',
      });
      await showRecordingNotification(contact.name);
    } catch (e) {
      lineEngaged = false;
      console.warn('CRM-VOZ: falha ao iniciar gravação na chamada', e);
    }
    return;
  }

  if (event === 'Disconnected') {
    if (!lineEngaged && !isCallRecordingActive()) return;
    lineEngaged = false;
    try {
      const result = await finishCallRecording();
      await dismissRecordingNotification();
      if (result && onCallEndedHandler) {
        onCallEndedHandler(result);
      }
    } catch (e) {
      console.warn('CRM-VOZ: falha ao encerrar gravação', e);
    }
    lastPhone = undefined;
    return;
  }

  if (event === 'Missed' || event === 'Incoming') {
    if (event === 'Missed') {
      lineEngaged = false;
      lastPhone = undefined;
    }
  }
}
