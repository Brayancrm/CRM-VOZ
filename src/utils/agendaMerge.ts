import type {
  DeviceCalendarEvent,
  ScheduledCallWithContact,
} from '@/types';

export type AgendaAppItem = { kind: 'app' } & ScheduledCallWithContact;

export type AgendaDeviceItem = { kind: 'device' } & DeviceCalendarEvent;

export type AgendaItem = AgendaAppItem | AgendaDeviceItem;

export function agendaItemKey(item: AgendaItem): string {
  return item.kind === 'app' ? item.id : `device-${item.id}`;
}

export function agendaItemSortTime(item: AgendaItem): number {
  return item.kind === 'app' ? item.scheduled_at : item.startAt;
}

export function mergeAgendaSections(params: {
  filter: 'upcoming' | 'day' | 'week' | 'month' | 'next7';
  filterDay: Date;
  appInRange: ScheduledCallWithContact[];
  appOverdue: ScheduledCallWithContact[];
  deviceEvents: DeviceCalendarEvent[];
  periodTitle: string;
  dayTitle: string;
}): { title: string; data: AgendaItem[] }[] {
  const {
    filter,
    appInRange,
    appOverdue,
    deviceEvents,
    periodTitle,
    dayTitle,
  } = params;

  const deviceItems: AgendaDeviceItem[] = deviceEvents.map((ev) => ({
    kind: 'device',
    ...ev,
  }));

  if (filter === 'day') {
    const appItems: AgendaAppItem[] = appInRange.map((a) => ({
      kind: 'app',
      ...a,
    }));
    const merged = [...appItems, ...deviceItems].sort(
      (a, b) => agendaItemSortTime(a) - agendaItemSortTime(b)
    );
    return merged.length > 0 ? [{ title: dayTitle, data: merged }] : [];
  }

  const sections: { title: string; data: AgendaItem[] }[] = [];
  const overdueIds = new Set(appOverdue.map((o) => o.id));

  if (appOverdue.length > 0) {
    sections.push({
      title: 'Atrasados — reagende ou conclua',
      data: appOverdue.map((a) => ({ kind: 'app' as const, ...a })),
    });
  }

  const mainApp = appInRange.filter((i) => !overdueIds.has(i.id));
  const mainItems: AgendaItem[] = [
    ...mainApp.map((a) => ({ kind: 'app' as const, ...a })),
    ...deviceItems,
  ].sort((a, b) => agendaItemSortTime(a) - agendaItemSortTime(b));

  if (mainItems.length > 0) {
    sections.push({
      title: appOverdue.length > 0 ? 'Neste período' : periodTitle,
      data: mainItems,
    });
  }

  return sections;
}

export function countAgendaItems(sections: { data: AgendaItem[] }[]): number {
  return sections.reduce((n, s) => n + s.data.length, 0);
}

export function countByKind(sections: { data: AgendaItem[] }[]): {
  app: number;
  device: number;
} {
  let app = 0;
  let device = 0;
  for (const section of sections) {
    for (const item of section.data) {
      if (item.kind === 'app') app += 1;
      else device += 1;
    }
  }
  return { app, device };
}

export function isAppItem(item: AgendaItem): item is AgendaAppItem {
  return item.kind === 'app';
}

export function isDeviceItem(item: AgendaItem): item is AgendaDeviceItem {
  return item.kind === 'device';
}
