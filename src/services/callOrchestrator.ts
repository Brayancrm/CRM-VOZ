import { AppState, Platform } from 'react-native';
import type { PhoneCallEvent } from '@/services/callDetector/types';
import {
  beginCallSession,
  finishCallWithNote,
  getActiveCall,
  isCallSessionActive,
  clearActiveCallState,
} from '@/services/callFlow';
import { resolveContactForCall, resolvePhoneForCall } from '@/utils/phoneMatch';
import { reconcileCallSessionContact } from '@/services/callContactReconcile';

export type CallEndedPayload = {
  sessionId: string;
  noteId: string;
  contactId: string;
};

let lineEngaged = false;
let lastPhone: string | undefined;
let lastWasIncoming = false;
let onCallEndedHandler: ((payload: CallEndedPayload) => void) | null = null;
let disconnectHandling = false;
let lastDisconnectHandledAt = 0;

export function setOnCallEnded(
  handler: ((payload: CallEndedPayload) => void) | null
): void {
  onCallEndedHandler = handler;
}

export function resetCallOrchestrator(): void {
  lineEngaged = false;
  lastPhone = undefined;
  lastWasIncoming = false;
}

export async function handlePhoneEvent(
  event: PhoneCallEvent,
  phone?: string,
  nativeSessionId?: string
): Promise<void> {
  if (phone) lastPhone = phone;

  if (event === 'Incoming') {
    lastWasIncoming = true;
    return;
  }

  if (event === 'Offhook') {
    if (lineEngaged || isCallSessionActive()) return;
    lineEngaged = true;
    const direction = lastWasIncoming ? 'in' : 'out';
    lastWasIncoming = false;
    try {
      const phoneForMatch = await resolvePhoneForCall(lastPhone);
      if (phoneForMatch) lastPhone = phoneForMatch;
      const { contact, phone } = await resolveContactForCall(phoneForMatch);
      if (AppState.currentState !== 'active') {
        await new Promise((r) => setTimeout(r, 500));
      }
      await beginCallSession({
        contact,
        phone: phone || contact.phone_normalized,
        direction,
        nativeSessionId,
      });
    } catch (e) {
      lineEngaged = false;
      console.warn('SeCretina: falha ao identificar contato na chamada', e);
    }
    return;
  }

  if (event === 'Disconnected') {
    const now = Date.now();
    if (disconnectHandling || now - lastDisconnectHandledAt < 12_000) {
      lineEngaged = false;
      lastPhone = undefined;
      clearActiveCallState();
      return;
    }
    disconnectHandling = true;
    lastDisconnectHandledAt = now;
    lineEngaged = false;
    try {
      await new Promise((r) => setTimeout(r, 400));
      let result = isCallSessionActive() ? await finishCallWithNote() : null;

      if (!result && nativeSessionId && onCallEndedHandler) {
        const { openPostCallFromNativeSession } = await import(
          '@/services/postCallNavigation'
        );
        result = await openPostCallFromNativeSession(nativeSessionId);
      }

      if (result && onCallEndedHandler) {
        const fixed = await reconcileCallSessionContact(result.sessionId);
        onCallEndedHandler({
          ...result,
          contactId: fixed?.contactId ?? result.contactId,
        });
      }
    } catch (e) {
      console.warn('SeCretina: falha ao abrir nota pós-chamada', e);
    } finally {
      disconnectHandling = false;
      clearActiveCallState();
    }
    lastPhone = undefined;
    return;
  }

  if (event === 'Missed') {
    lineEngaged = false;
    lastPhone = undefined;
    lastWasIncoming = false;
  }
}
