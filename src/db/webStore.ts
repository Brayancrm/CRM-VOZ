import type {
  CallSession,
  Contact,
  Note,
  ScheduledCall,
  ScheduledCallWithContact,
  TranscriptionStatus,
} from '@/types';

const STORAGE_KEY = 'crmvoz_web_v1';

type StoreData = {
  contacts: Contact[];
  notes: Note[];
  scheduled_calls: ScheduledCall[];
  call_sessions: CallSession[];
};

let data: StoreData = {
  contacts: [],
  notes: [],
  scheduled_calls: [],
  call_sessions: [],
};

let ready = false;

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function load(): void {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    data = JSON.parse(raw) as StoreData;
  } catch {
    data = { contacts: [], notes: [], scheduled_calls: [], call_sessions: [] };
  }
}

export async function initWebStore(): Promise<void> {
  if (ready) return;
  load();
  ready = true;
}

export function resetWebStore(): void {
  data = { contacts: [], notes: [], scheduled_calls: [], call_sessions: [] };
  ready = false;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function getWebDatabaseReady(): Promise<void> {
  await initWebStore();
}

// --- Contacts ---

export async function webListContacts(search?: string): Promise<Contact[]> {
  let list = [...data.contacts];
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone_normalized.includes(digits || q)
    );
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function webGetContactById(id: string): Promise<Contact | null> {
  return data.contacts.find((c) => c.id === id) ?? null;
}

export async function webFindContactByPhone(
  phone: string
): Promise<Contact | null> {
  return data.contacts.find((c) => c.phone_normalized === phone) ?? null;
}

export async function webCreateContact(contact: Contact): Promise<Contact> {
  if (data.contacts.some((c) => c.phone_normalized === contact.phone_normalized)) {
    throw new Error('Telefone já cadastrado.');
  }
  data.contacts.push(contact);
  persist();
  return contact;
}

export async function webUpdateContact(
  id: string,
  patch: { name?: string; phone_normalized?: string }
): Promise<void> {
  const i = data.contacts.findIndex((c) => c.id === id);
  if (i < 0) return;
  data.contacts[i] = { ...data.contacts[i], ...patch };
  persist();
}

export async function webDeleteContact(id: string): Promise<void> {
  data.notes = data.notes.filter((n) => n.contact_id !== id);
  data.call_sessions = data.call_sessions.filter((s) => s.contact_id !== id);
  data.scheduled_calls = data.scheduled_calls.filter((s) => s.contact_id !== id);
  data.contacts = data.contacts.filter((c) => c.id !== id);
  persist();
}

// --- Notes ---

export async function webListNotesByContact(contactId: string): Promise<Note[]> {
  return data.notes
    .filter((n) => n.contact_id === contactId)
    .sort((a, b) => b.created_at - a.created_at);
}

export async function webCreateNote(note: Note): Promise<Note> {
  data.notes.push(note);
  persist();
  return note;
}

export async function webDeleteNote(id: string): Promise<void> {
  data.notes = data.notes.filter((n) => n.id !== id);
  persist();
}

export async function webUpdateNote(id: string, body: string): Promise<void> {
  const i = data.notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  data.notes[i] = { ...data.notes[i], body: body.trim() };
  persist();
}

// --- Scheduled ---

export async function webListScheduledInRange(
  start: number,
  end: number
): Promise<ScheduledCallWithContact[]> {
  return data.scheduled_calls
    .filter((s) => s.scheduled_at >= start && s.scheduled_at <= end)
    .sort((a, b) => a.scheduled_at - b.scheduled_at)
    .map((s) => {
      const c = data.contacts.find((x) => x.id === s.contact_id);
      return {
        ...s,
        note: s.note ?? '',
        completed: s.completed ?? 0,
        contact_name: c?.name ?? 'Desconhecido',
        phone_normalized: c?.phone_normalized ?? '',
      };
    });
}

export async function webCreateScheduledCall(item: ScheduledCall): Promise<void> {
  data.scheduled_calls.push(item);
  persist();
}

export async function webDeleteScheduledCall(id: string): Promise<void> {
  data.scheduled_calls = data.scheduled_calls.filter((s) => s.id !== id);
  persist();
}

export async function webListOverduePending(): Promise<
  ScheduledCallWithContact[]
> {
  const now = Date.now();
  return data.scheduled_calls
    .filter((s) => (s.completed ?? 0) === 0 && s.scheduled_at < now)
    .sort((a, b) => a.scheduled_at - b.scheduled_at)
    .map((s) => {
      const c = data.contacts.find((x) => x.id === s.contact_id);
      return {
        ...s,
        note: s.note ?? '',
        completed: s.completed ?? 0,
        contact_name: c?.name ?? 'Desconhecido',
        phone_normalized: c?.phone_normalized ?? '',
      };
    });
}

export async function webSetScheduledCompleted(
  id: string,
  completed: boolean
): Promise<void> {
  const i = data.scheduled_calls.findIndex((s) => s.id === id);
  if (i < 0) return;
  data.scheduled_calls[i].completed = completed ? 1 : 0;
  persist();
}

export async function webRescheduleScheduledCall(
  id: string,
  patch: { scheduled_at: number; note?: string }
): Promise<void> {
  const i = data.scheduled_calls.findIndex((s) => s.id === id);
  if (i < 0) return;
  data.scheduled_calls[i].scheduled_at = patch.scheduled_at;
  if (patch.note !== undefined) {
    data.scheduled_calls[i].note = patch.note;
  }
  data.scheduled_calls[i].completed = 0;
  persist();
}

// --- Call sessions ---

export async function webCreateCallSession(session: CallSession): Promise<CallSession> {
  data.call_sessions.push(session);
  persist();
  return session;
}

export async function webEndCallSession(
  id: string,
  patch: {
    ended_at: number;
    audio_uri?: string | null;
    transcription_status?: TranscriptionStatus;
  }
): Promise<void> {
  const i = data.call_sessions.findIndex((s) => s.id === id);
  if (i < 0) return;
  data.call_sessions[i] = {
    ...data.call_sessions[i],
    ended_at: patch.ended_at,
    audio_uri: patch.audio_uri ?? data.call_sessions[i].audio_uri,
    transcription_status:
      patch.transcription_status ?? data.call_sessions[i].transcription_status,
  };
  persist();
}

export async function webGetCallSessionById(id: string): Promise<CallSession | null> {
  return data.call_sessions.find((s) => s.id === id) ?? null;
}

export async function webListSessionsByContact(
  contactId: string
): Promise<CallSession[]> {
  return data.call_sessions
    .filter((s) => s.contact_id === contactId)
    .sort((a, b) => b.started_at - a.started_at);
}

export async function webUpdateCallSessionTranscription(
  id: string,
  text: string,
  status: TranscriptionStatus = 'done'
): Promise<void> {
  const i = data.call_sessions.findIndex((s) => s.id === id);
  if (i < 0) return;
  data.call_sessions[i].transcription_text = text;
  data.call_sessions[i].transcription_status = status;
  persist();
}

export async function webSetCallSessionTranscriptionStatus(
  id: string,
  status: TranscriptionStatus
): Promise<void> {
  const i = data.call_sessions.findIndex((s) => s.id === id);
  if (i < 0) return;
  data.call_sessions[i].transcription_status = status;
  persist();
}

export async function webListSessionsAwaitingTranscription(): Promise<
  CallSession[]
> {
  return data.call_sessions
    .filter(
      (s) =>
        s.audio_uri &&
        (s.transcription_status === 'pending' ||
          s.transcription_status === 'failed')
    )
    .sort((a, b) => (a.ended_at ?? 0) - (b.ended_at ?? 0));
}
