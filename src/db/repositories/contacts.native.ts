import { getDatabase } from '@/db/database.native';
import type { Contact } from '@/types';

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    name: row.name as string,
    phone_normalized: row.phone_normalized as string,
    created_at: row.created_at as number,
  };
}

export async function listContacts(search?: string): Promise<Contact[]> {
  const db = await getDatabase();
  if (search?.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM contacts
       WHERE LOWER(name) LIKE ? OR phone_normalized LIKE ?
       ORDER BY name COLLATE NOCASE ASC`,
      q,
      q.replace(/\D/g, '') || q
    );
    return rows.map(rowToContact);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC`
  );
  return rows.map(rowToContact);
}

export async function getContactById(id: string): Promise<Contact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM contacts WHERE id = ?`,
    id
  );
  return row ? rowToContact(row) : null;
}

export async function findContactByPhone(
  phoneNormalized: string
): Promise<Contact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM contacts WHERE phone_normalized = ?`,
    phoneNormalized
  );
  return row ? rowToContact(row) : null;
}

export async function createContact(
  contact: Omit<Contact, 'created_at'> & { created_at?: number }
): Promise<Contact> {
  const db = await getDatabase();
  const created_at = contact.created_at ?? Date.now();
  await db.runAsync(
    `INSERT INTO contacts (id, name, phone_normalized, created_at) VALUES (?, ?, ?, ?)`,
    contact.id,
    contact.name,
    contact.phone_normalized,
    created_at
  );
  return { ...contact, created_at };
}

export async function updateContact(
  id: string,
  data: { name?: string; phone_normalized?: string }
): Promise<void> {
  const db = await getDatabase();
  const current = await getContactById(id);
  if (!current) return;
  await db.runAsync(
    `UPDATE contacts SET name = ?, phone_normalized = ? WHERE id = ?`,
    data.name ?? current.name,
    data.phone_normalized ?? current.phone_normalized,
    id
  );
}

export async function deleteContact(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM notes WHERE contact_id = ?`, id);
  await db.runAsync(`DELETE FROM call_sessions WHERE contact_id = ?`, id);
  await db.runAsync(`DELETE FROM scheduled_calls WHERE contact_id = ?`, id);
  await db.runAsync(`DELETE FROM contacts WHERE id = ?`, id);
}
