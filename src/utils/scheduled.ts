import type { ScheduledCall, ScheduledCallWithContact } from '@/types';

export function isScheduledCompleted(item: ScheduledCall): boolean {
  return item.completed === 1;
}

export function isScheduledOverdue(item: ScheduledCall, now = Date.now()): boolean {
  return !isScheduledCompleted(item) && item.scheduled_at < now;
}

/** Pendentes (atrasados primeiro) e concluídos recentes para a ficha do contato. */
export function partitionContactSchedules(
  items: ScheduledCallWithContact[],
  completedLimit = 5
): {
  pending: ScheduledCallWithContact[];
  completed: ScheduledCallWithContact[];
} {
  const now = Date.now();
  const pending = items
    .filter((i) => !isScheduledCompleted(i))
    .sort((a, b) => {
      const aOver = a.scheduled_at < now;
      const bOver = b.scheduled_at < now;
      if (aOver !== bOver) return aOver ? -1 : 1;
      return a.scheduled_at - b.scheduled_at;
    });
  const completed = items
    .filter((i) => isScheduledCompleted(i))
    .sort((a, b) => b.scheduled_at - a.scheduled_at)
    .slice(0, completedLimit);
  return { pending, completed };
}
