import type { ScheduledCall } from '@/types';

export function isScheduledCompleted(item: ScheduledCall): boolean {
  return item.completed === 1;
}

export function isScheduledOverdue(item: ScheduledCall, now = Date.now()): boolean {
  return !isScheduledCompleted(item) && item.scheduled_at < now;
}
