import type { AgendaItem } from '@/utils/agendaMerge';
import { isAppItem } from '@/utils/agendaMerge';
import { formatDateTime, formatEventTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';

export function agendaItemMatchesQuery(
  item: AgendaItem,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (isAppItem(item)) {
    const haystack = [
      item.contact_name,
      item.phone_normalized,
      formatPhoneDisplay(item.phone_normalized),
      item.note ?? '',
      formatDateTime(item.scheduled_at),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  const haystack = [
    item.title,
    item.calendarTitle,
    item.location ?? '',
    item.notes ?? '',
    formatEventTime(item.startAt, item.endAt, item.allDay),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterAgendaSections(
  sections: { title: string; data: AgendaItem[] }[],
  query: string
): { title: string; data: AgendaItem[] }[] {
  const q = query.trim();
  if (!q) return sections;
  return sections
    .map((section) => ({
      title: section.title,
      data: section.data.filter((item) => agendaItemMatchesQuery(item, q)),
    }))
    .filter((section) => section.data.length > 0);
}

export function countAgendaItemsTotal(
  sections: { data: AgendaItem[] }[]
): number {
  return sections.reduce((n, s) => n + s.data.length, 0);
}
