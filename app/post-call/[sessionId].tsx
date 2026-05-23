import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { getContactById } from '@/db/repositories/contacts';
import { getCallSessionById } from '@/db/repositories/callSessions';
import { listNotesByContact, updateNote } from '@/db/repositories/notes';
import type { Contact, Note, TranscriptionStatus } from '@/types';
import {
  retryTranscription,
  subscribeTranscriptionQueue,
} from '@/services/transcriptionQueue';
import { formatDateTime } from '@/utils/date';
import { showAppAlert } from '@/utils/alert';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import {
  playAudioFile,
  stopAudio,
  isAudioPlaying,
} from '@/services/audioPlayback';

export default function PostCallScreen() {
  const router = useRouter();
  const { sessionId, contactId, noteId } = useLocalSearchParams<{
    sessionId: string;
    contactId: string;
    noteId?: string;
  }>();

  const [contact, setContact] = useState<Contact | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [playing, setPlaying] = useState(false);
  const [txStatus, setTxStatus] = useState<TranscriptionStatus | null>(null);

  const load = useCallback(async () => {
    if (!contactId || !sessionId) return;
    const c = await getContactById(contactId);
    setContact(c);
    const session = await getCallSessionById(sessionId);
    setHasAudio(Boolean(session?.audio_uri));
    setTxStatus(session?.transcription_status ?? null);

    const notes = await listNotesByContact(contactId);
    const target =
      (noteId ? notes.find((n) => n.id === noteId) : null) ??
      notes.find((n) => n.call_session_id === sessionId) ??
      notes[0];
    if (target) {
      setNote(target);
      const isPlaceholder = target.body.startsWith('[');
      const fromSession = session?.transcription_text?.trim();
      if (fromSession && isPlaceholder) {
        setEditBody(fromSession);
      } else {
        setEditBody(isPlaceholder ? '' : target.body);
      }
    }
  }, [contactId, sessionId, noteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    return subscribeTranscriptionQueue(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (txStatus !== 'pending' && txStatus !== 'processing') return;
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [txStatus, load]);

  const txLabel = (): string => {
    switch (txStatus) {
      case 'processing':
        return 'Transcrevendo sua fala…';
      case 'pending':
        return 'Na fila para transcrever…';
      case 'done':
        return 'Transcrição concluída — revise o texto abaixo.';
      case 'failed':
        return 'Falha na transcrição. Toque em Tentar de novo.';
      default:
        return '';
    }
  };

  const saveNote = async () => {
    if (!note) return;
    const body = editBody.trim();
    if (!body) {
      showAppAlert('Nota vazia', 'Escreva um resumo da ligação antes de salvar.');
      return;
    }
    await updateNote(note.id, body);
    router.replace(`/contact/${contactId}`);
  };

  const playRecording = async () => {
    if (Platform.OS === 'web') {
      showAppAlert('Somente no celular', 'Reprodução de áudio não disponível na web.');
      return;
    }
    const session = await getCallSessionById(sessionId!);
    if (!session?.audio_uri) {
      showAppAlert('Sem áudio', 'Nenhuma gravação foi salva nesta chamada.');
      return;
    }
    if (playing && isAudioPlaying()) {
      await stopAudio();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      await playAudioFile(session.audio_uri);
    } catch (e) {
      showAppAlert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível reproduzir.'
      );
    } finally {
      setPlaying(false);
    }
  };

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Carregando…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pós-chamada</Text>
      <Text style={styles.subtitle}>{contact.name}</Text>
      <Text style={styles.hint}>
        Ligação encerrada. Gravei apenas a sua voz — edite o resumo abaixo.
        {hasAudio
          ? ' Você pode ouvir a gravação antes de salvar.'
          : ' Nenhum áudio foi salvo nesta chamada.'}
      </Text>

      {txLabel() ? (
        <Text
          style={
            txStatus === 'failed' ? styles.txFailed : styles.txInfo
          }
        >
          {txLabel()}
        </Text>
      ) : null}

      {hasAudio && Platform.OS !== 'web' ? (
        <Button
          title={playing ? 'Parar áudio' : 'Ouvir gravação'}
          variant="secondary"
          onPress={playRecording}
        />
      ) : null}

      {txStatus === 'failed' && note && sessionId ? (
        <Button
          title="Tentar transcrever de novo"
          variant="secondary"
          onPress={() => retryTranscription(sessionId, note.id)}
        />
      ) : null}

      <Text style={styles.label}>Resumo da conversa</Text>
      <TextInput
        style={styles.input}
        multiline
        autoFocus
        placeholder="Ex.: cliente pediu proposta, retorno na segunda…"
        value={editBody}
        onChangeText={setEditBody}
      />

      {note ? (
        <Text style={styles.meta}>
          {formatDateTime(note.created_at)}
          {txStatus ? ` · ${txStatus}` : ''}
        </Text>
      ) : null}

      <Button title="Salvar e ir para o contato" onPress={saveNote} />
      <Button
        title="Ver ficha do contato"
        variant="ghost"
        onPress={() => router.replace(`/contact/${contactId}`)}
      />
      <Button
        title="Agendar próxima ligação"
        variant="secondary"
        onPress={() => router.replace(`/contact/${contactId}?schedule=1`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.bg, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 18, color: colors.primary, fontWeight: '600' },
  hint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 8 },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
  },
  meta: { fontSize: 12, color: colors.textMuted },
  txInfo: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  txFailed: { fontSize: 14, color: colors.danger, fontWeight: '600' },
  muted: { color: colors.textMuted },
});
