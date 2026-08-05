import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { DeviceCalendarEvent } from '@/types';

export type CalendarAccess = 'granted' | 'denied' | 'unavailable';

export async function getCalendarAccess(): Promise<CalendarAccess> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status === 'granted') return 'granted';
    return 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestCalendarAccess(): Promise<CalendarAccess> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function listDeviceCalendarEvents(
  startMs: number,
  endMs: number
): Promise<{ events: DeviceCalendarEvent[]; access: CalendarAccess }> {
  if (Platform.OS === 'web') {
    return { events: [], access: 'unavailable' };
  }

  let access = await getCalendarAccess();
  if (access !== 'granted') {
    return { events: [], access };
  }

  try {
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    );
    if (calendars.length === 0) {
      return { events: [], access };
    }

    const raw = await Calendar.getEventsAsync(
      calendars.map((c) => c.id),
      new Date(startMs),
      new Date(endMs)
    );

    const calendarById = new Map(calendars.map((c) => [c.id, c.title]));

    const events: DeviceCalendarEvent[] = raw
      .map((ev) => ({
        id: String(ev.id),
        title: (ev.title || 'Sem título').trim(),
        startAt: new Date(ev.startDate).getTime(),
        endAt: new Date(ev.endDate).getTime(),
        allDay: Boolean(ev.allDay),
        calendarTitle: calendarById.get(ev.calendarId) || 'Calendário',
        location: (ev.location || '').trim(),
        notes: (ev.notes || '').trim(),
      }))
      .filter((ev) => ev.endAt >= startMs && ev.startAt <= endMs)
      .sort((a, b) => a.startAt - b.startAt);

    return { events, access };
  } catch (e) {
    console.warn('CRM-VOZ: falha ao ler calendário', e);
    return { events: [], access };
  }
}

export async function openDeviceCalendarEvent(eventId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Calendar.openEventInCalendarAsync({ id: eventId });
}
