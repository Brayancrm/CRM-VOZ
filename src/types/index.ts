export type CallDirection = 'in' | 'out';

export type NoteSource = 'call_mic' | 'voice' | 'typed' | 'post_call';

export type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped';

export interface Contact {
  id: string;
  name: string;
  phone_normalized: string;
  created_at: number;
}

export interface CallSession {
  id: string;
  contact_id: string;
  phone: string;
  direction: CallDirection;
  started_at: number;
  ended_at: number | null;
  audio_uri: string | null;
  transcription_status: TranscriptionStatus;
  transcription_text: string | null;
}

export interface Note {
  id: string;
  contact_id: string;
  call_session_id: string | null;
  body: string;
  source: NoteSource;
  created_at: number;
}

export interface ScheduledCall {
  id: string;
  contact_id: string;
  scheduled_at: number;
  note: string;
  completed: number;
  notified_1h: number;
  notified_5m: number;
}

export type AgendaFilter = 'upcoming' | 'day' | 'week' | 'month' | 'next7';

export interface ScheduledCallWithContact extends ScheduledCall {
  contact_name: string;
  phone_normalized: string;
}
