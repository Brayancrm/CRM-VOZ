import type { ScheduledCall, ScheduledCallWithContact } from '@/types';
import {
  webListScheduledInRange,
  webCreateScheduledCall,
  webDeleteScheduledCall,
  webListOverduePending,
  webSetScheduledCompleted,
  webRescheduleScheduledCall,
} from '@/db/webStore';

export async function listScheduledInRange(
  start: number,
  end: number
): Promise<ScheduledCallWithContact[]> {
  return webListScheduledInRange(start, end);
}

export async function listOverduePending(): Promise<ScheduledCallWithContact[]> {
  return webListOverduePending();
}

export async function createScheduledCall(item: ScheduledCall): Promise<void> {
  return webCreateScheduledCall(item);
}

export async function setScheduledCompleted(
  id: string,
  completed: boolean
): Promise<void> {
  return webSetScheduledCompleted(id, completed);
}

export async function rescheduleScheduledCall(
  id: string,
  data: { scheduled_at: number; note?: string }
): Promise<void> {
  return webRescheduleScheduledCall(id, data);
}

export async function deleteScheduledCall(id: string): Promise<void> {
  return webDeleteScheduledCall(id);
}

export async function getScheduledById(
  id: string
): Promise<ScheduledCallWithContact | null> {
  const all = await webListScheduledInRange(0, Number.MAX_SAFE_INTEGER);
  return all.find((s) => s.id === id) ?? null;
}
