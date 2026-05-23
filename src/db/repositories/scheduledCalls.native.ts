import { getDatabase } from '@/db/database.native';
import type {
  ScheduledCall,
  ScheduledCallWithContact,
} from '@/types';

function rowToScheduled(row: Record<string, unknown>): ScheduledCall {
  return {
    id: row.id as string,
    contact_id: row.contact_id as string,
    scheduled_at: row.scheduled_at as number,
    note: (row.note as string) ?? '',
    completed: (row.completed as number) ?? 0,
    notified_1h: row.notified_1h as number,
    notified_5m: row.notified_5m as number,
  };
}

export async function listScheduledInRange(
  start: number,
  end: number
): Promise<ScheduledCallWithContact[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.*, c.name as contact_name, c.phone_normalized
     FROM scheduled_calls s
     JOIN contacts c ON c.id = s.contact_id
     WHERE s.scheduled_at >= ? AND s.scheduled_at <= ?
     ORDER BY s.scheduled_at ASC`,
    start,
    end
  );
  return rows.map((row) => ({
    ...rowToScheduled(row),
    contact_name: row.contact_name as string,
    phone_normalized: row.phone_normalized as string,
  }));
}

export async function createScheduledCall(item: ScheduledCall): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scheduled_calls (id, contact_id, scheduled_at, note, completed, notified_1h, notified_5m)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.contact_id,
    item.scheduled_at,
    item.note ?? '',
    item.completed ?? 0,
    item.notified_1h,
    item.notified_5m
  );
}

export async function listOverduePending(): Promise<ScheduledCallWithContact[]> {
  const db = await getDatabase();
  const now = Date.now();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.*, c.name as contact_name, c.phone_normalized
     FROM scheduled_calls s
     JOIN contacts c ON c.id = s.contact_id
     WHERE s.completed = 0 AND s.scheduled_at < ?
     ORDER BY s.scheduled_at ASC`,
    now
  );
  return rows.map((row) => ({
    ...rowToScheduled(row),
    contact_name: row.contact_name as string,
    phone_normalized: row.phone_normalized as string,
  }));
}

export async function setScheduledCompleted(
  id: string,
  completed: boolean
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE scheduled_calls SET completed = ? WHERE id = ?`,
    completed ? 1 : 0,
    id
  );
}

export async function rescheduleScheduledCall(
  id: string,
  data: { scheduled_at: number; note?: string }
): Promise<void> {
  const db = await getDatabase();
  const current = await getScheduledById(id);
  if (!current) return;
  await db.runAsync(
    `UPDATE scheduled_calls SET scheduled_at = ?, note = ?, completed = 0 WHERE id = ?`,
    data.scheduled_at,
    data.note ?? current.note,
    id
  );
}

export async function deleteScheduledCall(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM scheduled_calls WHERE id = ?`, id);
}

export async function getScheduledById(
  id: string
): Promise<ScheduledCallWithContact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT s.*, c.name as contact_name, c.phone_normalized
     FROM scheduled_calls s
     JOIN contacts c ON c.id = s.contact_id
     WHERE s.id = ?`,
    id
  );
  if (!row) return null;
  return {
    ...rowToScheduled(row),
    contact_name: row.contact_name as string,
    phone_normalized: row.phone_normalized as string,
  };
}
