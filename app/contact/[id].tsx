import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Linking,
  Pressable,
  ScrollView,
  InteractionManager,
  KeyboardAvoidingView,
} from 'react-native';
import { ScheduleDayPicker } from '@/components/ScheduleDayPicker';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ScheduleDateTimePicker } from '@/components/ScheduleDateTimePicker';
import { getContactById } from '@/db/repositories/contacts';
import {
  listNotesByContact,
  createNote,
  updateNote,
  deleteNote,
} from '@/db/repositories/notes';
import { createScheduledCall, listScheduledByContact, rescheduleScheduledCall, deleteScheduledCall, setScheduledCompleted } from '@/db/repositories/scheduledCalls';
import { scheduleCallReminders, cancelCallReminders } from '@/services/notifications';
import { speakText, stopSpeaking, isSpeaking } from '@/services/speech';
import {
  playAudioFile,
  stopAudio,
  isAudioPlaying,
} from '@/services/audioPlayback';
import { listSessionsByContact } from '@/db/repositories/callSessions';
import { getActiveCall, repairCallSessionAudio } from '@/services/callFlow';
import type { CallSession, Contact, Note, ScheduledCallWithContact } from '@/types';
import { formatPhoneDisplay } from '@/utils/phone';
import { showAppAlert, showConfirm, showAppAlertActions } from '@/utils/alert';
import { waitForModalClose } from '@/utils/afterModalClose';
import { formatDateTime, formatDate } from '@/utils/date';
import {
  filterContactNotes,
  hasActiveNoteFilters,
  type NoteDateFilter,
} from '@/utils/noteSearch';
import { createId } from '@/utils/id';
import { useColors } from '@/context/ThemeContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { Button } from '@/components/ui/Button';
import {
  retryTranscription,
  subscribeTranscriptionQueue,
  transcribeAudioUri,
} from '@/services/transcriptionQueue';
import { NoteCard } from '@/components/NoteCard';
import { AgendaScheduledCard } from '@/components/AgendaScheduledCard';
import { partitionContactSchedules } from '@/utils/scheduled';
import {
  resolveCallNoteParts,
  getNoteSpeakableText,
  isPlaceholderLike,
} from '@/utils/callNote';
import {
  startMicRecording,
  stopMicRecording,
  isRecording,
} from '@/services/recording';
import {
  createStandaloneVoiceNote,
  newVoiceNoteSessionId,
} from '@/services/voiceNote';
import { hasMicrophonePermission } from '@/services/permissionsSetup';
import { normalizeAudioUri } from '@/utils/audioUri';

export default function ContactDetailScreen() {
  const { id, schedule, q } = useLocalSearchParams<{
    id: string;
    schedule?: string;
    q?: string;
  }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteModal, setNoteModal] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteRecording, setNoteRecording] = useState(false);
  const [noteVoiceSessionId, setNoteVoiceSessionId] = useState<string | null>(
    null
  );
  const [notePendingAudioUri, setNotePendingAudioUri] = useState<string | null>(
    null
  );
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editTranscription, setEditTranscription] = useState('');
  const [editHint, setEditHint] = useState<string | null>(null);
  const [editRecording, setEditRecording] = useState(false);
  const [editVoiceBusy, setEditVoiceBusy] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(
    new Date(Date.now() + 3600000)
  );
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduledItems, setScheduledItems] = useState<ScheduledCallWithContact[]>(
    []
  );
  const [rescheduleTarget, setRescheduleTarget] =
    useState<ScheduledCallWithContact | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(new Date());
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [watchSessionId, setWatchSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [playingAudioNoteId, setPlayingAudioNoteId] = useState<string | null>(
    null
  );
  const [speakingNoteId, setSpeakingNoteId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] =
    useState<NoteDateFilter>('all');
  const [historyFilterDay, setHistoryFilterDay] = useState(new Date());

  const colors = useColors();
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, justifyContent: 'center', padding: 24 },
    header: {
      padding: 16,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    name: { fontSize: 22, fontWeight: '700', color: c.text },
    phone: { fontSize: 15, color: c.textMuted, marginTop: 4 },
    actionsWrap: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionCell: { flex: 1, paddingVertical: 10, minHeight: 44 },
    actionCellHalf: { flex: 1, paddingVertical: 10, minHeight: 44 },
    editHint: {
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 20,
      marginBottom: 4,
    },
    section: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    list: { flex: 1 },
    listContent: { paddingBottom: 24 },
    noteItem: { paddingHorizontal: 16 },
    empty: {
      color: c.textMuted,
      textAlign: 'center',
      marginTop: 24,
      paddingHorizontal: 16,
    },
    muted: { color: c.textMuted, textAlign: 'center', marginBottom: 16 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    modal: {
      backgroundColor: c.surface,
      padding: 20,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      gap: 10,
      maxHeight: '70%',
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    modalSub: { fontSize: 14, color: c.textMuted },
    modalInput: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      textAlignVertical: 'top',
      color: c.text,
      backgroundColor: c.bg,
    },
    modalLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      marginTop: 4,
    },
    scheduleNoteInput: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      textAlignVertical: 'top',
      backgroundColor: c.bg,
      color: c.text,
    },
    voiceHint: { fontSize: 13, color: c.textMuted, lineHeight: 20 },
    voiceRecording: {
      fontSize: 13,
      fontWeight: '600',
      color: c.danger,
    },
    voiceReady: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    modalVoiceRow: { flexDirection: 'row', gap: 8 },
    modalVoiceBtn: { flex: 1, paddingVertical: 10, minHeight: 44 },
    editTranscriptionBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: c.transcriptionBg,
      maxHeight: 120,
    },
    editTranscriptionText: {
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
    },
    editSectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    searchWrap: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
      backgroundColor: c.bg,
    },
    searchInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: c.text,
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    filterChipActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '22',
    },
    filterChipText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    filterChipTextActive: { color: c.primary },
    searchMeta: {
      fontSize: 12,
      color: c.textMuted,
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    clearFilters: { alignSelf: 'flex-start', paddingVertical: 4 },
    clearFiltersText: { fontSize: 13, fontWeight: '600', color: c.primary },
    schedulesWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    schedulesTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
      marginBottom: 8,
    },
    schedulesEmpty: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 4,
      lineHeight: 20,
    },
    schedulesSub: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 10,
      marginBottom: 6,
    },
  }));

  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions]
  );

  const noteFilters = useMemo(
    () => ({
      query: historySearch,
      dateFilter: historyDateFilter,
      customDay: historyFilterDay,
    }),
    [historySearch, historyDateFilter, historyFilterDay]
  );

  const filteredNotes = useMemo(
    () => filterContactNotes(notes, sessions, noteFilters),
    [notes, sessions, noteFilters]
  );

  const { pending: pendingSchedules, completed: completedSchedules } = useMemo(
    () => partitionContactSchedules(scheduledItems),
    [scheduledItems]
  );

  const filtersActive = hasActiveNoteFilters(noteFilters);

  const dateFilterLabels: { key: NoteDateFilter; label: string }[] = [
    { key: 'all', label: 'Tudo' },
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mês' },
    { key: 'day', label: 'Dia' },
  ];

  const load = useCallback(async () => {
    if (!id) return;
    const c = await getContactById(id);
    setContact(c);
    if (c) {
      const [n, sess, sched] = await Promise.all([
        listNotesByContact(id),
        listSessionsByContact(id),
        listScheduledByContact(id),
      ]);
      setNotes(n);
      setSessions(sess);
      setScheduledItems(sched);
      const live =
        getActiveCall()?.contactId === id ? getActiveCall()?.sessionId : null;
      setWatchSessionId(live ?? null);
    }
  }, [id]);

  const openScheduleModal = useCallback(() => {
    const defaultAt = new Date(Date.now() + 3600000);
    defaultAt.setSeconds(0, 0);
    setScheduleAt(defaultAt);
    setScheduleNote('');
    setScheduleSaving(false);
    setScheduleModal(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** Quando a ligação termina, limpa o estado de «em ligação». */
  useEffect(() => {
    if (!watchSessionId || Platform.OS === 'web' || !contact) return;

    let cancelled = false;
    const tick = async () => {
      const active = getActiveCall();
      if (active?.sessionId === watchSessionId) return;
      if (cancelled) return;
      setWatchSessionId(null);
    };

    void tick();
    const interval = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [watchSessionId, contact]);

  useEffect(() => {
    // Mantém histórico atualizado se ainda houver fila antiga.
    return subscribeTranscriptionQueue(() => {
      void load();
    });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (schedule === '1') {
        openScheduleModal();
      }
    }, [schedule, openScheduleModal])
  );

  useEffect(() => {
    if (typeof q === 'string' && q.trim()) {
      setHistorySearch(q.trim());
    }
  }, [q]);

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Contato não encontrado.</Text>
        <Button title="Voltar" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const resetNoteModal = () => {
    setNoteModal(false);
    setNoteBody('');
    setNoteRecording(false);
    setNoteVoiceSessionId(null);
    setNotePendingAudioUri(null);
  };

  const openNoteModal = () => {
    setNoteBody('');
    setNoteRecording(false);
    setNoteVoiceSessionId(null);
    setNotePendingAudioUri(null);
    setNoteModal(true);
  };

  const cancelNoteModal = async () => {
    if (noteRecording) {
      try {
        await stopMicRecording();
      } catch {
        /* descarta gravação parcial */
      }
    }
    resetNoteModal();
  };

  const startNoteVoiceRecording = async () => {
    if (Platform.OS === 'web') {
      showAppAlert(
        'Somente no celular',
        'Gravação de voz funciona no app instalado, não no navegador.'
      );
      return;
    }
    if (getActiveCall() || isRecording()) {
      showAppAlert(
        'Gravação em andamento',
        'Encerre a gravação da ligação antes de gravar uma nota de voz.'
      );
      return;
    }
    const granted = await hasMicrophonePermission();
    if (!granted) {
      showAppAlert(
        'Microfone',
        'Permita o microfone nas definições do SeCretina para gravar a nota.'
      );
      return;
    }
    try {
      const sid = newVoiceNoteSessionId();
      await startMicRecording(sid);
      setNoteVoiceSessionId(sid);
      setNotePendingAudioUri(null);
      setNoteRecording(true);
    } catch (e) {
      showAppAlert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível gravar.'
      );
    }
  };

  const stopNoteVoiceRecording = async (): Promise<string | null> => {
    const result = await stopMicRecording();
    setNoteRecording(false);
    if (!result?.uri) {
      setNoteVoiceSessionId(null);
      return null;
    }
    setNotePendingAudioUri(result.uri);
    if (result.sessionId) {
      setNoteVoiceSessionId(result.sessionId);
    }
    return result.uri;
  };

  const saveTypedNoteOnly = async (body: string) => {
    await createNote({
      id: createId(),
      contact_id: contact.id,
      call_session_id: null,
      body,
      source: 'typed',
      created_at: Date.now(),
    });
    resetNoteModal();
    await load();
  };

  const saveNote = async () => {
    const body = noteBody.trim();
    let audioUri = notePendingAudioUri;

    if (noteRecording) {
      const recorded = await stopNoteVoiceRecording();
      if (recorded) audioUri = recorded;
    }

    if (!body && !audioUri) return;

    if (audioUri) {
      try {
        await createStandaloneVoiceNote(contact, {
          body: body || undefined,
          audioUri,
          sessionId: noteVoiceSessionId ?? undefined,
        });
        resetNoteModal();
        await load();
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Áudio inválido.';
        if (body) {
          showConfirm(
            'Áudio inválido',
            `${msg}\n\nDeseja salvar apenas o texto digitado?`,
            async () => saveTypedNoteOnly(body)
          );
        } else {
          showAppAlert('Áudio inválido', msg);
        }
        return;
      }
    }

    await saveTypedNoteOnly(body);
  };

  const openEditNote = (
    note: Note,
    options?: { hint?: string; emptyBody?: boolean }
  ) => {
    setEditingNote(note);
    const session = note.call_session_id
      ? sessionById.get(note.call_session_id)
      : undefined;
    const { userNotes, transcription } = resolveCallNoteParts(
      note.body,
      session?.transcription_text
    );
    if (options?.emptyBody) {
      setEditBody('');
    } else {
      setEditBody(userNotes || (isPlaceholderLike(note.body) ? '' : note.body.trim()));
    }
    setEditTranscription(transcription);
    setEditHint(options?.hint ?? null);
    setEditRecording(false);
    setEditVoiceBusy(false);
  };

  const closeEditNote = async () => {
    if (editRecording) {
      try {
        await stopMicRecording();
      } catch {
        /* descarta gravação parcial */
      }
    }
    setEditingNote(null);
    setEditBody('');
    setEditTranscription('');
    setEditHint(null);
    setEditRecording(false);
    setEditVoiceBusy(false);
  };

  const startEditVoiceRecording = async () => {
    if (Platform.OS === 'web') {
      showAppAlert(
        'Somente no celular',
        'Gravação de voz funciona no app instalado.'
      );
      return;
    }
    if (getActiveCall() || isRecording()) {
      showAppAlert(
        'Gravação em andamento',
        'Encerre a gravação da ligação antes de gravar.'
      );
      return;
    }
    const granted = await hasMicrophonePermission();
    if (!granted) {
      showAppAlert(
        'Microfone',
        'Permita o microfone nas definições do SeCretina.'
      );
      return;
    }
    try {
      await startMicRecording(newVoiceNoteSessionId());
      setEditRecording(true);
    } catch (e) {
      showAppAlert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível gravar.'
      );
    }
  };

  const stopEditVoiceRecording = async (): Promise<string> => {
    const result = await stopMicRecording();
    setEditRecording(false);
    if (!result?.uri) return editBody.trim();

    setEditVoiceBusy(true);
    try {
      const text = await transcribeAudioUri(result.uri);
      const chunk = text.trim();
      if (!chunk) {
        showAppAlert('Sem fala', 'Não foi detectada fala na gravação.');
        return editBody.trim();
      }
      const merged = editBody.trim()
        ? `${editBody.trim()}\n\n${chunk}`
        : chunk;
      setEditBody(merged);
      return merged;
    } catch (e) {
      showAppAlert(
        'Erro ao transcrever',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
      return editBody.trim();
    } finally {
      setEditVoiceBusy(false);
    }
  };

  const saveEditedNote = async () => {
    if (!editingNote || editVoiceBusy) return;
    let body = editBody.trim();
    if (editRecording) {
      body = (await stopEditVoiceRecording()).trim();
    }
    await updateNote(editingNote.id, body);
    await closeEditNote();
    await load();
  };

  const stopAllPlayback = async () => {
    await stopSpeaking();
    await stopAudio();
    setPlayingAudioNoteId(null);
    setSpeakingNoteId(null);
  };

  const listenNote = async (note: Note) => {
    if (speakingNoteId === note.id && isSpeaking()) {
      await stopAllPlayback();
      setSpeakingNoteId(null);
      return;
    }

    await stopAllPlayback();
    const session = note.call_session_id
      ? sessionById.get(note.call_session_id)
      : undefined;
    const toSpeak = getNoteSpeakableText(note.body, session?.transcription_text);
    if (!toSpeak) {
      showAppAlert('Sem texto', 'Não há texto para ler em voz alta.');
      return;
    }
    setSpeakingNoteId(note.id);
    try {
      await speakText(toSpeak);
    } catch (e) {
      showAppAlert(
        'Erro ao ler texto',
        e instanceof Error
          ? e.message
          : 'Verifique se o celular tem voz TTS em português (Definições → Idioma → Texto para voz).'
      );
    } finally {
      setSpeakingNoteId(null);
    }
  };

  const playNoteRecording = async (note: Note) => {
    if (Platform.OS === 'web') {
      showAppAlert(
        'Somente no celular',
        'A reprodução da gravação funciona no app no dispositivo.'
      );
      return;
    }
    if (!note.call_session_id) return;
    let session = sessionById.get(note.call_session_id);
    let audioUri = session?.audio_uri ?? null;
    if (!audioUri) {
      audioUri = await repairCallSessionAudio(note.call_session_id);
      if (audioUri) await load();
    }
    if (!audioUri) {
      showAppAlert('Sem gravação', 'Não há áudio salvo para esta nota.');
      return;
    }
    audioUri = normalizeAudioUri(audioUri);

    if (playingAudioNoteId === note.id && isAudioPlaying()) {
      await stopAllPlayback();
      return;
    }

    await stopAllPlayback();
    setPlayingAudioNoteId(note.id);
    try {
      await playAudioFile(audioUri);
    } catch (e) {
      showAppAlert(
        'Erro ao reproduzir',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
    } finally {
      setPlayingAudioNoteId(null);
    }
  };

  const scheduleCall = async () => {
    if (scheduleAt.getTime() < Date.now() + 60 * 1000) {
      showAppAlert(
        'Data inválida',
        'Use os seletores de dia, mês, ano, hora e minuto — pelo menos 1 minuto à frente.'
      );
      return;
    }
    try {
      setScheduleSaving(true);
      const scheduledId = createId();
      await createScheduledCall({
        id: scheduledId,
        contact_id: contact.id,
        scheduled_at: scheduleAt.getTime(),
        note: scheduleNote.trim(),
        completed: 0,
        notified_1h: 0,
        notified_5m: 0,
      });
      try {
        await scheduleCallReminders(
          scheduledId,
          contact.name,
          scheduleAt.getTime()
        );
      } catch (notifErr) {
        console.warn(notifErr);
      }
      setScheduleModal(false);
      setScheduleNote('');
      const when = formatDateTime(scheduleAt.getTime());
      const msg =
        Platform.OS === 'web'
          ? `Ligação com ${contact.name} em ${when}.\n\nSalvo na aba Agenda (filtro "Próximos"). Lembretes 1h e 5min só no celular.`
          : `Ligação com ${contact.name} em ${when}.\n\nLembretes: 1 hora e 5 minutos antes (se o sistema permitir).`;
      await waitForModalClose();
      await load();
      InteractionManager.runAfterInteractions(() => {
        showAppAlertActions('Agendado', msg, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Ver agenda',
            onPress: () => {
              router.navigate('/(tabs)/agenda');
            },
          },
        ]);
      });
    } catch (e) {
      showAppAlert(
        'Erro ao agendar',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
    } finally {
      setScheduleSaving(false);
    }
  };

  const openReschedule = (item: ScheduledCallWithContact) => {
    setRescheduleTarget(item);
    const defaultAt = new Date();
    defaultAt.setMinutes(defaultAt.getMinutes() + 30, 0, 0);
    if (item.scheduled_at > defaultAt.getTime()) {
      defaultAt.setTime(item.scheduled_at);
    }
    setRescheduleAt(defaultAt);
    setRescheduleNote(item.note ?? '');
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget) return;
    const minFuture = Date.now() + 60 * 1000;
    if (rescheduleAt.getTime() < minFuture) {
      showAppAlert(
        'Data inválida',
        'Escolha dia, mês, ano, hora e minuto no futuro (pelo menos 1 minuto à frente).'
      );
      return;
    }
    const target = rescheduleTarget;
    const newAt = rescheduleAt.getTime();
    const newNote = rescheduleNote.trim();
    const whenLabel = formatDateTime(newAt);

    try {
      setRescheduleSaving(true);
      await cancelCallReminders(target.id);
      await rescheduleScheduledCall(target.id, {
        scheduled_at: newAt,
        note: newNote,
      });
      try {
        await scheduleCallReminders(
          target.id,
          target.contact_name,
          newAt
        );
      } catch (notifErr) {
        console.warn(notifErr);
      }
      setRescheduleTarget(null);
      await waitForModalClose();
      await load();
      InteractionManager.runAfterInteractions(() => {
        showAppAlert('Reagendado', `Nova data: ${whenLabel}`);
      });
    } catch (e) {
      showAppAlert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível reagendar.'
      );
    } finally {
      setRescheduleSaving(false);
    }
  };

  const toggleScheduleComplete = async (item: ScheduledCallWithContact) => {
    const next = item.completed !== 1;
    await setScheduledCompleted(item.id, next);
    if (next) {
      await cancelCallReminders(item.id);
      showAppAlert('Concluída', 'Ligação agendada marcada como feita.');
    }
    await load();
  };

  const removeSchedule = (item: ScheduledCallWithContact) => {
    showConfirm(
      'Excluir agendamento',
      `Remover ligação de ${formatDateTime(item.scheduled_at)}?`,
      async () => {
        await cancelCallReminders(item.id);
        await deleteScheduledCall(item.id);
        showAppAlert('Excluído', 'Agendamento removido.');
        await load();
      }
    );
  };

  const callPhone = () => {
    Linking.openURL(`tel:+${contact.phone_normalized}`);
  };

  const clearHistoryFilters = () => {
    setHistorySearch('');
    setHistoryDateFilter('all');
    setHistoryFilterDay(new Date());
  };

  const historySummary = (): string => {
    if (!filtersActive) {
      return `${notes.length} nota(s)`;
    }
    const parts: string[] = [`${filteredNotes.length} de ${notes.length} nota(s)`];
    if (historySearch.trim()) {
      parts.push(`«${historySearch.trim()}»`);
    }
    if (historyDateFilter === 'today') parts.push('hoje');
    else if (historyDateFilter === 'week') parts.push('esta semana');
    else if (historyDateFilter === 'month') parts.push('este mês');
    else if (historyDateFilter === 'day') {
      parts.push(formatDate(historyFilterDay.getTime()));
    }
    return parts.join(' · ');
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.name}>{contact.name}</Text>
              <Text style={styles.phone}>
                {formatPhoneDisplay(contact.phone_normalized)}
              </Text>
            </View>

            <View style={styles.actionsWrap}>
              <View style={styles.actionRow}>
                <Button
                  title="Nova nota"
                  onPress={openNoteModal}
                  style={styles.actionCellHalf}
                />
                <Button
                  title="Agendar"
                  variant="secondary"
                  onPress={openScheduleModal}
                  style={styles.actionCellHalf}
                />
              </View>
              <View style={styles.actionRow}>
                <Button
                  title="Editar"
                  variant="secondary"
                  onPress={() => router.push(`/contact/edit/${contact.id}`)}
                  style={styles.actionCellHalf}
                />
                <Button
                  title="Ligar"
                  variant="secondary"
                  onPress={callPhone}
                  style={styles.actionCellHalf}
                />
              </View>
            </View>

            <View style={styles.schedulesWrap}>
              <Text style={styles.schedulesTitle}>Agendamentos</Text>
              {pendingSchedules.length === 0 &&
              completedSchedules.length === 0 ? (
                <Text style={styles.schedulesEmpty}>
                  Nenhuma ligação agendada — toque em Agendar acima.
                </Text>
              ) : null}
              {pendingSchedules.map((item) => (
                <AgendaScheduledCard
                  key={item.id}
                  item={item}
                  compact
                  onToggleComplete={() => void toggleScheduleComplete(item)}
                  onReschedule={() => openReschedule(item)}
                  onDelete={() => removeSchedule(item)}
                />
              ))}
              {completedSchedules.length > 0 ? (
                <>
                  <Text style={styles.schedulesSub}>Concluídas recentemente</Text>
                  {completedSchedules.map((item) => (
                    <AgendaScheduledCard
                      key={item.id}
                      item={item}
                      compact
                      onToggleComplete={() => void toggleScheduleComplete(item)}
                      onReschedule={() => openReschedule(item)}
                      onDelete={() => removeSchedule(item)}
                    />
                  ))}
                </>
              ) : null}
            </View>

            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar palavra na nota ou transcrição…"
                placeholderTextColor={colors.textMuted}
                value={historySearch}
                onChangeText={setHistorySearch}
              />
              <View style={styles.filterRow}>
                {dateFilterLabels.map((f) => (
                  <Pressable
                    key={f.key}
                    style={[
                      styles.filterChip,
                      historyDateFilter === f.key && styles.filterChipActive,
                    ]}
                    onPress={() => setHistoryDateFilter(f.key)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        historyDateFilter === f.key && styles.filterChipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {historyDateFilter === 'day' ? (
                <ScheduleDayPicker
                  value={historyFilterDay}
                  onChange={setHistoryFilterDay}
                />
              ) : null}
              {filtersActive ? (
                <Pressable
                  onPress={clearHistoryFilters}
                  style={styles.clearFilters}
                >
                  <Text style={styles.clearFiltersText}>Limpar filtros</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.searchMeta}>{historySummary()}</Text>
            <Text style={styles.section}>Histórico (recente → antigo)</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {notes.length === 0
              ? 'Nenhuma nota ainda.'
              : 'Nenhuma nota corresponde aos filtros.'}
          </Text>
        }
        renderItem={({ item }) => {
          const session = item.call_session_id
            ? sessionById.get(item.call_session_id)
            : undefined;
          const hasRecording = Boolean(session?.audio_uri);
          const speakable = Boolean(
            getNoteSpeakableText(item.body, session?.transcription_text)
          );
          return (
            <View style={styles.noteItem}>
              <NoteCard
                note={item}
                session={session}
                hasRecording={hasRecording}
                searchQuery={historySearch.trim() || undefined}
                ttsSpeaking={speakingNoteId === item.id}
                recordingPlaying={playingAudioNoteId === item.id}
                onPlayRecording={
                  hasRecording
                    ? () => {
                        void playNoteRecording(item);
                      }
                    : undefined
                }
                onRetryTranscription={
                  session &&
                  item.call_session_id &&
                  session.transcription_status === 'failed'
                    ? () => {
                        void retryTranscription(
                          item.call_session_id!,
                          item.id
                        ).then(load);
                      }
                    : undefined
                }
                onListen={
                  speakable
                    ? () => {
                        void listenNote(item);
                      }
                    : undefined
                }
                onEdit={() => openEditNote(item)}
                onDelete={() => {
                  showConfirm(
                    'Excluir nota?',
                    'Esta ação não pode ser desfeita.',
                    async () => {
                      await deleteNote(item.id);
                      await load();
                    }
                  );
                }}
              />
            </View>
          );
        }}
      />

      <Modal visible={noteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nova nota (texto ou voz)</Text>
            <Text style={styles.voiceHint}>
              Digite, grave voz, ou os dois. Toque «Gravar nota de voz» antes de
              salvar — a fala vira texto automaticamente.
            </Text>
            <TextInput
              style={styles.modalInput}
              multiline
              placeholder="Digite sua nota..."
              value={noteBody}
              onChangeText={setNoteBody}
            />
            {Platform.OS !== 'web' ? (
              <>
                {noteRecording ? (
                  <Text style={styles.voiceRecording}>
                    Gravando… fale sua nota e toque em Parar gravação.
                  </Text>
                ) : notePendingAudioUri ? (
                  <Text style={styles.voiceReady}>
                    Áudio gravado — salve para transcrever ou grave de novo.
                  </Text>
                ) : null}
                <View style={styles.modalVoiceRow}>
                  {noteRecording ? (
                    <Button
                      title="Parar gravação"
                      variant="danger"
                      onPress={() => void stopNoteVoiceRecording()}
                      style={styles.modalVoiceBtn}
                    />
                  ) : (
                    <Button
                      title={
                        notePendingAudioUri
                          ? 'Gravar de novo'
                          : 'Gravar nota de voz'
                      }
                      variant="secondary"
                      onPress={() => void startNoteVoiceRecording()}
                      style={styles.modalVoiceBtn}
                    />
                  )}
                </View>
              </>
            ) : null}
            <Button
              title="Salvar"
              onPress={() => void saveNote()}
              disabled={
                !noteBody.trim() && !notePendingAudioUri && !noteRecording
              }
            />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => void cancelNoteModal()}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={editingNote !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {editHint ? 'Nota da simulação' : 'Editar nota'}
            </Text>
            {editHint ? (
              <Text style={styles.editHint}>{editHint}</Text>
            ) : null}
            {editTranscription ? (
              <>
                <Text style={styles.editSectionLabel}>Transcrição (automática)</Text>
                <View style={styles.editTranscriptionBox}>
                  <Text style={styles.editTranscriptionText}>
                    {editTranscription}
                  </Text>
                </View>
              </>
            ) : null}
            <Text style={styles.editSectionLabel}>Sua nota</Text>
            <Text style={styles.voiceHint}>
              Digite ou use «Gravar nota de voz» para complementar. A transcrição
              automática fica acima e não é alterada aqui.
            </Text>
            <TextInput
              style={styles.modalInput}
              multiline
              autoFocus={!editTranscription}
              placeholder="Ex.: combinou retorno na sexta, cliente pediu orçamento..."
              value={editBody}
              onChangeText={setEditBody}
            />
            {Platform.OS !== 'web' ? (
              <>
                {editRecording ? (
                  <Text style={styles.voiceRecording}>
                    Gravando… fale e toque em Parar gravação.
                  </Text>
                ) : editVoiceBusy ? (
                  <Text style={styles.voiceReady}>Transcrevendo sua fala…</Text>
                ) : null}
                <View style={styles.modalVoiceRow}>
                  {editRecording ? (
                    <Button
                      title="Parar gravação"
                      variant="danger"
                      onPress={() => void stopEditVoiceRecording()}
                      style={styles.modalVoiceBtn}
                    />
                  ) : (
                    <Button
                      title="Gravar nota de voz"
                      variant="secondary"
                      onPress={() => void startEditVoiceRecording()}
                      disabled={editVoiceBusy}
                      style={styles.modalVoiceBtn}
                    />
                  )}
                </View>
              </>
            ) : null}
            <Button
              title="Salvar alterações"
              onPress={() => void saveEditedNote()}
              disabled={editVoiceBusy || editRecording}
            />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => void closeEditNote()}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={scheduleModal}
        animationType="slide"
        transparent
        onRequestClose={() => setScheduleModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modal}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Agendar ligação</Text>
            <ScheduleDateTimePicker
              value={scheduleAt}
              onChange={setScheduleAt}
            />
            <Text style={styles.modalLabel}>Nota do agendamento (opcional)</Text>
            <TextInput
              style={styles.scheduleNoteInput}
              placeholder="Ex.: falar sobre proposta, pedir retorno..."
              value={scheduleNote}
              onChangeText={setScheduleNote}
              multiline
              editable={!scheduleSaving}
            />
            <Button
              title="Confirmar agendamento"
              onPress={() => void scheduleCall()}
              disabled={scheduleSaving}
            />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => setScheduleModal(false)}
              disabled={scheduleSaving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!rescheduleTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setRescheduleTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modal}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Reagendar ligação</Text>
            {!rescheduleSaving ? (
              <ScheduleDateTimePicker
                value={rescheduleAt}
                onChange={setRescheduleAt}
              />
            ) : (
              <Text style={styles.modalSub}>Salvando novo horário…</Text>
            )}
            <Text style={styles.modalLabel}>Nota</Text>
            <TextInput
              style={styles.scheduleNoteInput}
              value={rescheduleNote}
              onChangeText={setRescheduleNote}
              multiline
              placeholder="Nota do agendamento"
              editable={!rescheduleSaving}
            />
            <Button
              title="Salvar novo horário"
              onPress={() => void confirmReschedule()}
              disabled={rescheduleSaving}
            />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => setRescheduleTarget(null)}
              disabled={rescheduleSaving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
