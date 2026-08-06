import {
  deleteScheduledCall,
  listScheduledByContact,
  listScheduledInRange,
  rescheduleScheduledCall,
} from '@/db/repositories/scheduledCalls';
import {
  cancelCallReminders,
  scheduleCallReminders,
} from '@/services/notifications';
import type { SecretinaLanguage } from '@/services/secretinaLanguage';
import {
  msgAgendaList,
  msgAmbiguousSchedules,
  msgCancelled,
  msgRescheduled,
  unnamedContact,
} from '@/services/secretinaSpeak';
import { formatDateTime } from '@/utils/date';
import { matchContactBySpokenName } from '@/utils/secretinaCommand';
import { normalizeSpoken } from '@/utils/normalizeSpoken';
import { parseSpokenDateRange } from '@/utils/spokenDateRange';
import type { ScheduledCallWithContact } from '@/types';

export type AgendaVoiceItem = {
  id: string;
  contactName: string;
  scheduledAt: number;
  note: string;
};

function toItem(
  s: ScheduledCallWithContact,
  lang: SecretinaLanguage
): AgendaVoiceItem {
  return {
    id: s.id,
    contactName: s.contact_name?.trim() || unnamedContact(lang),
    scheduledAt: s.scheduled_at,
    note: (s.note ?? '').trim(),
  };
}

function pendingOnly(rows: ScheduledCallWithContact[]): ScheduledCallWithContact[] {
  return rows.filter((r) => r.completed !== 1);
}

export function formatAgendaSpeakList(
  items: AgendaVoiceItem[],
  rangeLabel: string,
  lang: SecretinaLanguage = 'pt-BR'
): string {
  return msgAgendaList(lang, items, rangeLabel);
}

export async function listAgendaVoice(opts: {
  whenRaw?: string;
  contactQuery?: string;
  searchText?: string;
  now?: Date;
  lang?: SecretinaLanguage;
}): Promise<{ items: AgendaVoiceItem[]; rangeLabel: string; message: string }> {
  const lang = opts.lang ?? 'pt-BR';
  const now = opts.now ?? new Date();
  const range =
    parseSpokenDateRange(
      opts.whenRaw || opts.searchText || 'agenda',
      now,
      lang
    ) ?? parseSpokenDateRange('agenda', now, lang)!;

  let rows = pendingOnly(
    await listScheduledInRange(range.start, range.end)
  );

  if (opts.contactQuery?.trim()) {
    const contacts = rows.map((r) => ({
      id: r.contact_id,
      name: r.contact_name,
    }));
    const unique = new Map(contacts.map((c) => [c.id, c]));
    const match = matchContactBySpokenName(
      opts.contactQuery,
      [...unique.values()]
    );
    if (match.status === 'found' && match.contact) {
      rows = rows.filter((r) => r.contact_id === match.contact!.id);
    } else if (match.status === 'ambiguous') {
      const ids = new Set(match.candidates.map((c) => c.id));
      rows = rows.filter((r) => ids.has(r.contact_id));
    } else {
      const q = normalizeSpoken(opts.contactQuery);
      rows = rows.filter((r) =>
        normalizeSpoken(r.contact_name).includes(q)
      );
    }
  }

  const search = (opts.searchText ?? '').trim();
  if (search) {
    const q = normalizeSpoken(search);
    const qClean = q
      .replace(
        /\b(o\s+que\s+tenho|quais|mostra|mostrar|lista|listar|pesquisa|pesquisar|busca|buscar|agenda|agendamentos?|compromissos?|ligacoes?|chamadas?|hoje|amanha|esta\s+semana|proximos?|com|para|de|do|da|na|no|what\s+do\s+i\s+have|show|list|search|today|tomorrow|this\s+week|upcoming|que\s+tengo|mostrar|buscar|manana|esta\s+semana)\b/g,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (qClean.length >= 2) {
      const tokens = qClean.split(' ').filter((t) => t.length >= 2);
      rows = rows.filter((r) => {
        const hay = normalizeSpoken(
          `${r.contact_name} ${r.note} ${formatDateTime(r.scheduled_at, lang)}`
        );
        if (hay.includes(qClean)) return true;
        return tokens.length > 0 && tokens.every((t) => hay.includes(t));
      });
    }
  }

  const items = rows.map((r) => toItem(r, lang));
  const message = formatAgendaSpeakList(items, range.label, lang);
  return { items, rangeLabel: range.label, message };
}

export async function findScheduleCandidates(opts: {
  contactQuery?: string;
  whenRaw?: string;
  now?: Date;
}): Promise<ScheduledCallWithContact[]> {
  const now = opts.now ?? new Date();
  let rows: ScheduledCallWithContact[] = [];

  if (opts.contactQuery?.trim()) {
    const upcoming = pendingOnly(
      await listScheduledInRange(now.getTime() - 3_600_000, now.getTime() + 366 * 86_400_000)
    );
    const unique = new Map(
      upcoming.map((r) => [r.contact_id, { id: r.contact_id, name: r.contact_name }])
    );
    const match = matchContactBySpokenName(opts.contactQuery, [
      ...unique.values(),
    ]);
    if (match.status === 'found' && match.contact) {
      rows = pendingOnly(await listScheduledByContact(match.contact.id));
      rows = rows.filter((r) => r.scheduled_at >= now.getTime() - 3_600_000);
    } else if (match.status === 'ambiguous') {
      const ids = new Set(match.candidates.map((c) => c.id));
      rows = upcoming.filter((r) => ids.has(r.contact_id));
    } else {
      const q = normalizeSpoken(opts.contactQuery);
      rows = upcoming.filter((r) =>
        normalizeSpoken(r.contact_name).includes(q)
      );
    }
  } else {
    rows = pendingOnly(
      await listScheduledInRange(now.getTime() - 3_600_000, now.getTime() + 14 * 86_400_000)
    );
  }

  if (opts.whenRaw?.trim()) {
    const range = parseSpokenDateRange(opts.whenRaw, now);
    if (range) {
      rows = rows.filter(
        (r) => r.scheduled_at >= range.start && r.scheduled_at <= range.end
      );
    }
  }

  return rows.sort((a, b) => a.scheduled_at - b.scheduled_at);
}

export async function cancelScheduleVoice(
  item: ScheduledCallWithContact,
  lang: SecretinaLanguage = 'pt-BR'
): Promise<string> {
  await cancelCallReminders(item.id);
  await deleteScheduledCall(item.id);
  return msgCancelled(lang, item.contact_name, item.scheduled_at);
}

export async function rescheduleVoice(
  item: ScheduledCallWithContact,
  newAtMs: number,
  lang: SecretinaLanguage = 'pt-BR'
): Promise<string> {
  await cancelCallReminders(item.id);
  await rescheduleScheduledCall(item.id, {
    scheduled_at: newAtMs,
    note: item.note,
  });
  try {
    await scheduleCallReminders(item.id, item.contact_name, newAtMs);
  } catch (e) {
    console.warn('SeCretina: lembretes após remarcar', e);
  }
  return msgRescheduled(lang, item.contact_name, newAtMs);
}

export function speakAmbiguousSchedules(
  rows: ScheduledCallWithContact[],
  lang: SecretinaLanguage = 'pt-BR'
): string {
  const parts = rows.slice(0, 5).map((r, i) => {
    return `${i + 1}. ${r.contact_name}, ${formatDateTime(r.scheduled_at, lang)}`;
  });
  return msgAmbiguousSchedules(lang, parts);
}
