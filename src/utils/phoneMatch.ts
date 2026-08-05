import { listContacts, findContactByPhone, createContact } from '@/db/repositories/contacts';
import {
  normalizePhoneFromDevice,
  formatPhoneDisplay,
} from '@/utils/phone';
import { createId } from '@/utils/id';
import type { Contact } from '@/types';
import { getLastCallNumberWithRetry } from '@/services/callLog';

export function digitsOnly(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

/** Variantes comuns (BR +55, sem DDI, EUA +1) para bater com importação e registro. */
export function phoneMatchCandidates(raw: string | undefined | null): string[] {
  const base = digitsOnly(raw);
  if (!base) return [];

  const out = new Set<string>();
  out.add(base);

  if (base.length >= 10 && base.length <= 11 && !base.startsWith('55')) {
    out.add(`55${base}`);
  }
  if (base.startsWith('55') && base.length >= 12) {
    out.add(base.slice(2));
  }
  if (base.startsWith('1') && base.length === 11) {
    out.add(base.slice(1));
  }
  if (base.length === 10) {
    out.add(`1${base}`);
  }

  const deviceNorm = normalizePhoneFromDevice(base);
  if (deviceNorm) out.add(deviceNorm);

  return [...out].filter((d) => d.length >= 7);
}

export function phonesMatch(a: string, b: string): boolean {
  const candidatesA = phoneMatchCandidates(a);
  const candidatesB = phoneMatchCandidates(b);
  if (!candidatesA.length || !candidatesB.length) return false;

  for (const da of candidatesA) {
    for (const db of candidatesB) {
      if (da === db) return true;
      const tail = 9;
      if (da.length >= tail && db.length >= tail) {
        if (da.endsWith(db.slice(-tail)) || db.endsWith(da.slice(-tail))) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function matchContactByPhone(
  rawPhone: string | undefined
): Promise<Contact | null> {
  const candidates = phoneMatchCandidates(rawPhone);
  if (!candidates.length) return null;

  for (const digits of candidates) {
    const exact = await findContactByPhone(digits);
    if (exact) return exact;
  }

  const all = await listContacts();
  for (const c of all) {
    if (phonesMatch(c.phone_normalized, rawPhone ?? '')) return c;
  }
  return null;
}

/** Número da ligação: telefonia → registro de chamadas (várias tentativas). */
export async function resolvePhoneForCall(
  rawPhone?: string
): Promise<string> {
  const first = phoneMatchCandidates(rawPhone);
  if (first.length > 0) return first[0];

  const fromLog = await getLastCallNumberWithRetry();
  const fromLogCandidates = phoneMatchCandidates(fromLog);
  if (fromLogCandidates.length > 0) return fromLogCandidates[0];

  return '';
}

function isPlaceholderContactName(name: string): boolean {
  return /^Chamada\s*\+?0*$/i.test(name.trim()) || name === 'Número desconhecido';
}

/** Contato cadastrado ou criado só quando há número válido (evita «Chamada +0»). */
export async function resolveContactForCall(
  rawPhone?: string
): Promise<{ contact: Contact; created: boolean; phone: string }> {
  const phone = await resolvePhoneForCall(rawPhone);
  if (phone) {
    const existing = await matchContactByPhone(phone);
    if (existing) {
      return { contact: existing, created: false, phone };
    }
    const contact = await createContact({
      id: createId(),
      name: `Chamada ${formatPhoneDisplay(phone)}`,
      phone_normalized: phone,
    });
    return { contact, created: true, phone };
  }

  const existingUnknown = await matchContactByPhone('00000000000');
  if (existingUnknown && isPlaceholderContactName(existingUnknown.name)) {
    return { contact: existingUnknown, created: false, phone: '' };
  }

  const contact = await createContact({
    id: createId(),
    name: 'Número desconhecido',
    phone_normalized: '00000000000',
  });
  return { contact, created: true, phone: '' };
}
