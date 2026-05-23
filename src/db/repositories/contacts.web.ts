import type { Contact } from '@/types';
import {
  webListContacts,
  webGetContactById,
  webFindContactByPhone,
  webCreateContact,
  webUpdateContact,
  webDeleteContact,
} from '@/db/webStore';

export async function listContacts(search?: string): Promise<Contact[]> {
  return webListContacts(search);
}

export async function getContactById(id: string): Promise<Contact | null> {
  return webGetContactById(id);
}

export async function findContactByPhone(
  phoneNormalized: string
): Promise<Contact | null> {
  return webFindContactByPhone(phoneNormalized);
}

export async function createContact(
  contact: Omit<Contact, 'created_at'> & { created_at?: number }
): Promise<Contact> {
  const created_at = contact.created_at ?? Date.now();
  return webCreateContact({ ...contact, created_at } as Contact);
}

export async function updateContact(
  id: string,
  data: { name?: string; phone_normalized?: string }
): Promise<void> {
  return webUpdateContact(id, data);
}

export async function deleteContact(id: string): Promise<void> {
  return webDeleteContact(id);
}
