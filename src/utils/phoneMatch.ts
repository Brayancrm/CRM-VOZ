import { listContacts, findContactByPhone, createContact } from '@/db/repositories/contacts';
import {
  normalizePhoneFromDevice,
  formatPhoneDisplay,
} from '@/utils/phone';
import { createId } from '@/utils/id';
import type { Contact } from '@/types';

export function digitsOnly(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

export function phonesMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const tail = 8;
  if (da.length >= tail && db.length >= tail) {
    return da.endsWith(db.slice(-tail)) || db.endsWith(da.slice(-tail));
  }
  return false;
}

export async function matchContactByPhone(
  rawPhone: string | undefined
): Promise<Contact | null> {
  const digits = digitsOnly(rawPhone);
  if (!digits) return null;

  const exact = await findContactByPhone(digits);
  if (exact) return exact;

  const byNorm = await findContactByPhone(normalizePhoneFromDevice(digits));
  if (byNorm) return byNorm;

  const all = await listContacts();
  for (const c of all) {
    if (phonesMatch(c.phone_normalized, digits)) return c;
  }
  return null;
}

/** Contato cadastrado ou criado automaticamente para número desconhecido. */
export async function resolveContactForCall(
  rawPhone: string | undefined
): Promise<{ contact: Contact; created: boolean }> {
  const existing = await matchContactByPhone(rawPhone);
  if (existing) return { contact: existing, created: false };

  const digits = digitsOnly(rawPhone) || '0';
  const contact = await createContact({
    id: createId(),
    name: `Chamada ${formatPhoneDisplay(digits)}`,
    phone_normalized: digits,
  });
  return { contact, created: true };
}
