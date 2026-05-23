import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ScheduleDateTimePicker } from '@/components/ScheduleDateTimePicker';
import { getContactById } from '@/db/repositories/contacts';
import {
  listNotesByContact,
  createNote,
  updateNote,
  deleteNote,
  getCombinedHistoryText,
} from '@/db/repositories/notes';
import { createScheduledCall } from '@/db/repositories/scheduledCalls';
import { scheduleCallReminders } from '@/services/notifications';
import { speakText, stopSpeaking } from '@/services/speech';
import {
  playAudioFile,
  stopAudio,
  isAudioPlaying,
} from '@/services/audioPlayback';
import { listSessionsByContact } from '@/db/repositories/callSessions';
import {
  simulateCallStart,
  simulateCallEnd,
  getActiveSimulationSession,
} from '@/services/callSimulation';
import type { CallSession, Contact, Note } from '@/types';
import { formatPhoneDisplay } from '@/utils/phone';
import { showAppAlert, showConfirm } from '@/utils/alert';
import { formatDateTime } from '@/utils/date';
import { createId } from '@/utils/id';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { NoteCard } from '@/components/NoteCard';

export default function ContactDetailScreen() {
  const { id, schedule } = useLocalSearchParams<{
    id: string;
    schedule?: string;
  }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteModal, setNoteModal] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editHint, setEditHint] = useState<string | null>(null);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(
    new Date(Date.now() + 3600000)
  );
  const [scheduleNote, setScheduleNote] = useState('');
  const [simSessionId, setSimSessionId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [playingAudioNoteId, setPlayingAudioNoteId] = useState<string | null>(
    null
  );

  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions]
  );

  const load = useCallback(async () => {
    if (!id) return;
    const c = await getContactById(id);
    setContact(c);
    if (c) {
      const [n, sess] = await Promise.all([
        listNotesByContact(id),
        listSessionsByContact(id),
      ]);
      setNotes(n);
      setSessions(sess);
      const active = getActiveSimulationSession(id);
      setSimSessionId(active ?? null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (schedule === '1') {
        setScheduleModal(true);
      }
    }, [schedule])
  );

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Contato não encontrado.</Text>
        <Button title="Voltar" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const saveTypedNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    await createNote({
      id: createId(),
      contact_id: contact.id,
      call_session_id: null,
      body,
      source: 'typed',
      created_at: Date.now(),
    });
    setNoteBody('');
    setNoteModal(false);
    await load();
  };

  const openEditNote = (
    note: Note,
    options?: { hint?: string; emptyBody?: boolean }
  ) => {
    setEditingNote(note);
    setEditBody(options?.emptyBody ? '' : note.body);
    setEditHint(options?.hint ?? null);
  };

  const closeEditNote = () => {
    setEditingNote(null);
    setEditBody('');
    setEditHint(null);
  };

  const saveEditedNote = async () => {
    if (!editingNote) return;
    const body = editBody.trim();
    if (!body) {
      showAppAlert('Nota vazia', 'Digite algum texto antes de salvar.');
      return;
    }
    await updateNote(editingNote.id, body);
    closeEditNote();
    await load();
  };

  const stopAllPlayback = async () => {
    await stopSpeaking();
    await stopAudio();
    setListening(false);
    setPlayingAudioNoteId(null);
  };

  const listenNote = async (note: Note) => {
    await stopAllPlayback();
    setListening(true);
    try {
      await speakText(note.body);
    } finally {
      setListening(false);
    }
  };

  const listenAll = async () => {
    await stopAllPlayback();
    setListening(true);
    try {
      const text = await getCombinedHistoryText(contact.id);
      await speakText(text);
    } finally {
      setListening(false);
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
    const session = sessionById.get(note.call_session_id);
    if (!session?.audio_uri) {
      showAppAlert('Sem gravação', 'Não há áudio salvo para esta nota.');
      return;
    }

    if (playingAudioNoteId === note.id && isAudioPlaying()) {
      await stopAllPlayback();
      return;
    }

    await stopAllPlayback();
    setPlayingAudioNoteId(note.id);
    try {
      await playAudioFile(session.audio_uri);
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
      showAppAlert('Agendado', msg);
      router.push('/agenda');
    } catch (e) {
      showAppAlert(
        'Erro ao agendar',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
    }
  };

  const startSimulation = async () => {
    if (Platform.OS === 'web') {
      showAppAlert(
        'Somente no celular',
        'Gravação pelo microfone funciona no app no dispositivo, não no navegador.'
      );
      return;
    }
    try {
      const sessionId = await simulateCallStart(contact);
      setSimSessionId(sessionId);
    } catch (e) {
      showAppAlert('Erro', e instanceof Error ? e.message : 'Falha na gravação.');
    }
  };

  const endSimulation = async () => {
    if (!simSessionId) return;
    try {
      const { noteId } = await simulateCallEnd(contact, simSessionId);
      setSimSessionId(null);
      const refreshed = await listNotesByContact(contact.id);
      setNotes(refreshed);
      const created = refreshed.find((n) => n.id === noteId);
      if (created) {
        openEditNote(created, {
          emptyBody: true,
          hint:
            'Simulação encerrada — áudio salvo. Escreva o resumo da conversa. Depois use Ouvir áudio na nota (transcrição automática na Fase 4).',
        });
      }
    } catch (e) {
      setSimSessionId(null);
      showAppAlert(
        'Erro ao encerrar',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
    }
  };

  const callPhone = () => {
    Linking.openURL(`tel:+${contact.phone_normalized}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{contact.name}</Text>
        <Text style={styles.phone}>
          {formatPhoneDisplay(contact.phone_normalized)}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actions}>
        <Button
          title={listening ? 'Parar' : 'OUVIR tudo'}
          variant="secondary"
          onPress={
            listening || playingAudioNoteId
              ? stopAllPlayback
              : listenAll
          }
          style={styles.actionChip}
        />
        <Button
          title="Nova nota"
          onPress={() => setNoteModal(true)}
          style={styles.actionChip}
        />
        <Button
          title="Agendar"
          variant="secondary"
          onPress={() => setScheduleModal(true)}
          style={styles.actionChip}
        />
        <Button
          title="Editar"
          variant="secondary"
          onPress={() => router.push(`/contact/edit/${contact.id}`)}
          style={styles.actionChip}
        />
        <Button
          title="Ligar"
          variant="ghost"
          onPress={callPhone}
          style={styles.actionChip}
        />
      </ScrollView>

      <View style={styles.simBox}>
        <Text style={styles.simTitle}>Gravação da sua voz (ligação)</Text>
        <Text style={styles.simHint}>
          Toque em <Text style={styles.simHintBold}>Iniciar gravação</Text> antes ou
          durante a conversa (celular ou WhatsApp). Ao terminar, use{' '}
          <Text style={styles.simHintBold}>Encerrar</Text> — depois{' '}
          <Text style={styles.simHintBold}>Ouvir áudio</Text> na nota. Use fone de
          ouvido.
        </Text>
        {simSessionId ? (
          <>
            <Text style={styles.simRecording}>
              Gravando… Toque em Encerrar gravação quando terminar a conversa.
            </Text>
            <Button
              title="Encerrar gravação"
              variant="danger"
              onPress={endSimulation}
            />
          </>
        ) : (
          <Button title="Iniciar gravação" onPress={startSimulation} />
        )}
      </View>

      <Text style={styles.section}>Histórico (recente → antigo)</Text>
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Nenhuma nota ainda.</Text>
        }
        renderItem={({ item }) => {
          const session = item.call_session_id
            ? sessionById.get(item.call_session_id)
            : undefined;
          const hasRecording = Boolean(session?.audio_uri);
          return (
          <NoteCard
            note={item}
            hasRecording={hasRecording}
            recordingPlaying={playingAudioNoteId === item.id}
            onPlayRecording={
              hasRecording ? () => playNoteRecording(item) : undefined
            }
            onListen={() => listenNote(item)}
            onEdit={() => openEditNote(item)}
            onDelete={() => {
              showConfirm('Excluir nota?', 'Esta ação não pode ser desfeita.', async () => {
                await deleteNote(item.id);
                await load();
              });
            }}
          />
          );
        }}
      />

      <Modal visible={noteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nova nota (texto)</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              placeholder="Digite sua nota..."
              value={noteBody}
              onChangeText={setNoteBody}
            />
            <Button title="Salvar" onPress={saveTypedNote} />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => setNoteModal(false)}
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
            <TextInput
              style={styles.modalInput}
              multiline
              autoFocus
              placeholder="Ex.: combinou retorno na sexta, cliente pediu orçamento..."
              value={editBody}
              onChangeText={setEditBody}
            />
            <Button title="Salvar alterações" onPress={saveEditedNote} />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={closeEditNote}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={scheduleModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
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
            />
            <Button title="Confirmar agendamento" onPress={scheduleCall} />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => setScheduleModal(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  header: {
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  phone: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  actions: { maxHeight: 56, paddingVertical: 10, paddingHorizontal: 12 },
  actionChip: { marginRight: 8, minWidth: 120 },
  simBox: {
    margin: 16,
    marginTop: 0,
    padding: 12,
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  simTitle: { fontWeight: '600', color: colors.primary, marginBottom: 4 },
  simHint: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  simHintBold: { fontWeight: '700', color: colors.primary },
  simRecording: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
    marginBottom: 8,
  },
  editHint: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 4,
  },
  section: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: { flex: 1, paddingHorizontal: 16 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  muted: { color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 10,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  scheduleNoteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    backgroundColor: colors.bg,
  },
});
