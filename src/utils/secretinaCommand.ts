import { normalizeSpoken } from '@/utils/normalizeSpoken';
import { parseSpokenDateTime } from '@/utils/spokenDateTime';

export type SecretinaIntent =
  | { type: 'note'; contactQuery: string; noteBody: string }
  | { type: 'schedule'; contactQuery: string; whenRaw: string }
  | { type: 'unknown'; reason: string };

export type ContactMatchStatus = 'found' | 'ambiguous' | 'none';

export type ContactMatchResult = {
  status: ContactMatchStatus;
  contact: { id: string; name: string } | null;
  candidates: { id: string; name: string }[];
};

type ContactLike = { id: string; name: string };

/** Em JS, \b falha com acentos (ã, ç…). Usar texto já normalizado sem acentos. */
function hasScheduleKeyword(norm: string): boolean {
  return (
    /\b(agenda|agende|agendar|agendamento|agendamentos|marca|marque|marcar|reagenda|reagendar)\b/.test(
      norm
    ) || /\b(ligacao|chamada)\b/.test(norm)
  );
}

function hasNoteKeyword(norm: string): boolean {
  return /\b(nota|notas|anota|anotar|anote|anotacao)\b/.test(norm);
}

function stripArticles(q: string): string {
  return q.replace(/^(o|a|os|as|ao|à|aos|às)\s+/i, '').trim();
}

/**
 * Marcadores de data/hora no texto normalizado (sem acentos).
 * Devolve o índice no texto normalizado.
 */
function findWhenStartIndex(norm: string): number {
  const patterns = [
    /\bdepois\s+de\s+amanha\b/,
    /\bamanha\b/,
    /\bhoje\b/,
    /\bdaqui\s+a\s+\d{1,2}\s+anos?\b/,
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:\s*feira)?\b/,
    /\b(?:dia\s+)?\d{1,2}\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+20\d{2})?\b/,
    /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]20\d{2}\b/,
    /\bdia\s+\d{1,2}(?:\s*(?:de|\/|-)\s*(?:\d{1,2}|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?\b/,
    /\b(?:as|a)\s+\d{1,2}(?:[:h]\d{0,2})?\b/,
    /\b\d{1,2}\s*(?:horas?|hrs?)\b/,
    /\b\d{1,2}\s+da\s+(manha|tarde|noite)\b/,
  ];
  let best = -1;
  for (const re of patterns) {
    const m = norm.match(re);
    if (m?.index != null && (best < 0 || m.index < best)) {
      best = m.index;
    }
  }
  return best;
}

function stripScheduleNoise(before: string): string {
  let s = before.trim();
  // Remove verbos / substantivos de agenda em qualquer posição inicial
  s = s.replace(
    /\b(agenda|agende|agendar|agendamento|agendamentos|marca|marque|marcar|reagenda|reagendar|faz|fazer|quero|queria|pode|podia)\b/gi,
    ' '
  );
  s = s.replace(/\b(uma|um|o|a)\s+(ligacao|chamada|agendamento)\b/gi, ' ');
  s = s.replace(/\b(ligacao|chamada)\b/gi, ' ');
  s = s.replace(/\b(com|para|pro|pra|do|da|de|no|na|em)\b/gi, ' ');
  s = s.replace(/\b(contato|contacto)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function stripNoteNoise(before: string): string {
  let s = before.trim();
  s = s.replace(
    /\b(cria|crie|criar|faz|fazer|anota|anotar|anote|regista|registar|nova|quero|queria)\b/gi,
    ' '
  );
  s = s.replace(/\b(uma|um)\b/gi, ' ');
  s = s.replace(/\b(nota|notas|anotacao)\b/gi, ' ');
  s = s.replace(/\b(para|pro|pra|ao|a|o|do|da|de)\b/gi, ' ');
  s = s.replace(/\b(contato|contacto)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return stripArticles(s);
}

/**
 * Agenda: basta a palavra agenda/agendamento/marcar/ligação + data/hora + nome.
 * Funciona com «agenda ligação com Paulo amanhã às 15» (ã incluído).
 */
function parseScheduleCommand(cleaned: string, norm: string): SecretinaIntent | null {
  if (!hasScheduleKeyword(norm)) return null;

  const whenStart = findWhenStartIndex(norm);
  if (whenStart < 0) {
    return {
      type: 'unknown',
      reason:
        'Percebi que quer agendar, mas falta a data/hora. Ex.: «amanhã às 15» ou «quinta às 10».',
    };
  }

  // Sempre no texto normalizado (sem acentos) — evita bug do \b com «amanhã»
  const whenRaw = norm.slice(whenStart).trim();
  if (!parseSpokenDateTime(whenRaw)) {
    return {
      type: 'unknown',
      reason:
        'Não consegui interpretar a data/hora. Tente «amanhã às 15» ou «quinta às 10».',
    };
  }

  const contactQuery = stripScheduleNoise(norm.slice(0, whenStart));
  if (!contactQuery || contactQuery.length < 2) {
    return {
      type: 'unknown',
      reason:
        'Percebi o agendamento, mas falta o nome. Ex.: «agenda com Maria amanhã às 15».',
    };
  }

  return { type: 'schedule', contactQuery, whenRaw };
}

/**
 * Nota: basta a palavra «nota» / «anota» na frase.
 * «nota para Paulo Silva dizendo que reuniao amanha»
 */
function parseNoteCommand(cleaned: string, norm: string): SecretinaIntent | null {
  if (!hasNoteKeyword(norm)) return null;

  // Evita tratar «nota do agendamento» como criar nota de contacto sem contexto
  if (hasScheduleKeyword(norm) && !/\b(cria|crie|criar|anota|anotar|anote)\b/.test(norm)) {
    // Se tem agenda + nota, deixa o schedule tratar (agendar com nota fica para depois)
    return null;
  }

  const bodySplit = cleaned.match(
    /\b(?:dizendo\s+que|diz\s+que|falando\s+que|que\s*:|nota\s*:|:)\s*(.+)$/i
  );
  let noteBody = '';
  let beforeBody = cleaned;
  if (bodySplit && bodySplit.index != null) {
    noteBody = bodySplit[1].trim();
    beforeBody = cleaned.slice(0, bodySplit.index).trim();
  }

  let contactQuery = stripNoteNoise(normalizeSpoken(beforeBody));

  // Fallback: após a palavra nota, o próximo token(s) até «dizendo»/«que»
  if (!contactQuery || contactQuery.length < 2) {
    const m = norm.match(
      /\b(?:nota|notas|anota|anotar|anote|anotacao)\b\s+(?:para\s+|pro\s+|pra\s+|ao\s+|a\s+|o\s+)?(.+)/
    );
    if (m?.[1]) {
      let rest = m[1];
      const cut = rest.search(
        /\b(dizendo\s+que|diz\s+que|falando\s+que|que|nota)\b/
      );
      if (cut >= 0) {
        if (!noteBody) {
          const after = rest.slice(cut).replace(/^(dizendo\s+que|diz\s+que|falando\s+que|que|nota)\s*/i, '');
          noteBody = after.trim();
        }
        rest = rest.slice(0, cut);
      }
      contactQuery = stripArticles(
        rest.replace(/\b(para|pro|pra|ao|a|o|do|da|de)\b/g, ' ').replace(/\s+/g, ' ').trim()
      );
    }
  }

  if (!noteBody) {
    // Sem «dizendo que»: tenta «nota Paulo texto…»
    const m = norm.match(
      /\b(?:nota|notas|anotar|anote|anota)\b\s+(?:para\s+|pro\s+|pra\s+)?([a-z]+(?:\s+[a-z]+)?)\s+(.+)/
    );
    if (m) {
      contactQuery = stripArticles(m[1]);
      noteBody = m[2]
        .replace(/^(dizendo\s+que|diz\s+que|que)\s+/, '')
        .trim();
    }
  }

  if (!contactQuery || contactQuery.length < 2) {
    return {
      type: 'unknown',
      reason:
        'Percebi a nota, mas falta o contacto. Ex.: «nota para o Paulo dizendo que…».',
    };
  }

  if (!noteBody) {
    return {
      type: 'unknown',
      reason:
        'Falta o texto da nota. Ex.: «nota para o Paulo dizendo que ligou amanhã».',
    };
  }

  return { type: 'note', contactQuery, noteBody };
}

/**
 * Interpreta comando por palavras-chave na frase (não exige formato exacto).
 * Prioridade: agendamento → nota → desconhecido.
 */
export function parseSecretinaCommand(raw: string): SecretinaIntent {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { type: 'unknown', reason: 'Não ouvi nenhum comando.' };
  }

  const norm = normalizeSpoken(cleaned);

  const schedule = parseScheduleCommand(cleaned, norm);
  if (schedule) return schedule;

  const note = parseNoteCommand(cleaned, norm);
  if (note) return note;

  if (hasScheduleKeyword(norm) || hasNoteKeyword(norm)) {
    return {
      type: 'unknown',
      reason:
        'Entendi a intenção, mas faltam dados. Para agenda diga o nome e a hora; para nota diga o contacto e o texto.',
    };
  }

  return {
    type: 'unknown',
    reason:
      'Não entendi. Mencione «agenda» ou «nota» na frase. Ex.: «agenda com Maria amanhã às 15» ou «nota para o Paulo dizendo que…».',
  };
}

export function extractNoteBody(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const m = cleaned.match(
    /(?:dizendo\s+que|diz\s+que|com\s+a\s+nota|nota\s*:|:\s*)\s*(.+)$/i
  );
  if (m?.[1]) return m[1].trim();
  return cleaned;
}

function scoreContact(
  queryNorm: string,
  qTokens: string[],
  contactName: string
): number | null {
  const name = normalizeSpoken(contactName);
  if (!name) return null;
  const nTokens = name.split(/\s+/).filter(Boolean);

  if (name === queryNorm) return 100;

  if (qTokens.length >= 2) {
    const allIn = qTokens.every((t) => nTokens.includes(t) || name.includes(t));
    if (!allIn) return null;
    const firstOk = nTokens[0] === qTokens[0];
    const lastOk =
      nTokens[nTokens.length - 1] === qTokens[qTokens.length - 1];
    if (firstOk && lastOk) return 98;
    if (firstOk) return 92;
    return 85;
  }

  const q = qTokens[0] ?? queryNorm;
  if (nTokens[0] === q) return 80;
  if (nTokens.includes(q)) return 70;
  if (name.startsWith(q) || name.includes(` ${q}`)) return 60;
  return null;
}

export function matchContactBySpokenName(
  query: string,
  contacts: ContactLike[]
): ContactMatchResult {
  const queryNorm = stripArticles(normalizeSpoken(query));
  if (!queryNorm) {
    return { status: 'none', contact: null, candidates: [] };
  }
  const qTokens = queryNorm.split(/\s+/).filter((t) => t.length > 0);

  const scored: { contact: ContactLike; score: number }[] = [];
  for (const contact of contacts) {
    const score = scoreContact(queryNorm, qTokens, contact.name);
    if (score == null) continue;
    scored.push({ contact, score });
  }

  if (scored.length === 0) {
    return { status: 'none', contact: null, candidates: [] };
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;

  if (qTokens.length === 1) {
    const firstNameHits = scored.filter((s) => {
      const first = normalizeSpoken(s.contact.name).split(/\s+/)[0];
      return first === qTokens[0] && s.score >= 70;
    });
    if (firstNameHits.length > 1) {
      return {
        status: 'ambiguous',
        contact: null,
        candidates: firstNameHits.map((s) => ({
          id: s.contact.id,
          name: s.contact.name,
        })),
      };
    }
  }

  const top = scored.filter((s) => s.score === best && s.score >= 85);
  if (top.length > 1) {
    return {
      status: 'ambiguous',
      contact: null,
      candidates: top.map((s) => ({ id: s.contact.id, name: s.contact.name })),
    };
  }

  return {
    status: 'found',
    contact: { id: scored[0].contact.id, name: scored[0].contact.name },
    candidates: [],
  };
}
