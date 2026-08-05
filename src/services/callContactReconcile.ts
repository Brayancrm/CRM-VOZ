import {
  getCallSessionById,
  updateCallSessionContact,
} from '@/db/repositories/callSessions';
import { getContactById } from '@/db/repositories/contacts';
import { updateNotesContactForSession } from '@/db/repositories/notes';
import {
  matchContactByPhone,
  resolveContactForCall,
  resolvePhoneForCall,
} from '@/utils/phoneMatch';

/**
 * Corrige sessão criada com «Chamada +0» quando o número chega depois no CallLog.
 */
export async function reconcileCallSessionContact(
  sessionId: string
): Promise<{ contactId: string; noteId?: string } | null> {
  const session = await getCallSessionById(sessionId);
  if (!session) return null;

  const phone = await resolvePhoneForCall(session.phone);
  if (!phone || phone.length < 7) {
    return { contactId: session.contact_id };
  }

  let contact = await matchContactByPhone(phone);
  if (!contact) {
    const resolved = await resolveContactForCall(phone);
    contact = resolved.contact;
  }

  if (contact.id !== session.contact_id || session.phone !== phone) {
    await updateCallSessionContact(sessionId, {
      contact_id: contact.id,
      phone,
    });
    await updateNotesContactForSession(sessionId, contact.id);
  }

  return { contactId: contact.id };
}

export async function isUnknownPlaceholderContact(
  contactId: string
): Promise<boolean> {
  const c = await getContactById(contactId);
  if (!c) return false;
  if (c.name === 'Número desconhecido') return true;
  if (c.phone_normalized === '00000000000') return true;
  return /^Chamada\s*\+?0+\s*$/i.test(c.name.trim());
}
