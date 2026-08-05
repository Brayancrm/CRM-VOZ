import { View, Text, StyleSheet, Pressable, Platform, TouchableOpacity } from 'react-native';
import type { CallSession, Note } from '@/types';
import { formatDateTime } from '@/utils/date';
import { resolveCallNoteParts } from '@/utils/callNote';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { HighlightText } from '@/components/HighlightText';

const sourceLabels: Record<Note['source'], string> = {
  call_mic: 'Chamada (sua voz)',
  voice: 'Voz manual',
  typed: 'Digitado',
  post_call: 'Pós-chamada',
};

const txStatusLabels: Partial<Record<CallSession['transcription_status'], string>> = {
  pending: 'Transcrição na fila…',
  processing: 'Transcrevendo…',
  failed: 'Transcrição falhou',
  done: 'Transcrição OK',
};

type Props = {
  note: Note;
  session?: CallSession;
  hasRecording?: boolean;
  recordingPlaying?: boolean;
  onPlayRecording?: () => void;
  onListen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRetryTranscription?: () => void;
  searchQuery?: string;
  ttsSpeaking?: boolean;
};

export function NoteCard({
  note,
  session,
  hasRecording,
  recordingPlaying,
  onPlayRecording,
  onListen,
  onEdit,
  onDelete,
  onRetryTranscription,
  searchQuery,
  ttsSpeaking,
}: Props) {
  const styles = useThemedStyles((c) => ({
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    date: { fontSize: 12, color: c.textMuted, flex: 1 },
    chip: {
      fontSize: 11,
      color: c.chipText,
      backgroundColor: c.chip,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },
    section: {},
    sectionGap: { marginTop: 10 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    body: { fontSize: 15, color: c.text, lineHeight: 22 },
    transcription: {
      fontSize: 15,
      color: c.text,
      lineHeight: 22,
      backgroundColor: c.transcriptionBg,
      padding: 10,
      borderRadius: 8,
    },
    audioHint: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 8,
      fontStyle: 'italic',
    },
    txPending: {
      fontSize: 13,
      color: c.primary,
      fontWeight: '600',
      marginBottom: 6,
    },
    txFailed: {
      fontSize: 13,
      color: c.danger,
      fontWeight: '600',
      marginBottom: 6,
    },
    actions: { flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap' },
    actionBtn: { paddingVertical: 4 },
    actionText: { fontSize: 14, fontWeight: '600', color: c.primary },
    tts: { color: c.textMuted },
    danger: { color: c.danger },
  }));

  const txStatus = session?.transcription_status;
  const txHint =
    txStatus && txStatus !== 'skipped' && txStatus !== 'done'
      ? txStatusLabels[txStatus]
      : null;

  const { userNotes, transcription } = resolveCallNoteParts(
    note.body,
    session?.transcription_text
  );
  const isCallNote = Boolean(session?.audio_uri || transcription || userNotes);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDateTime(note.created_at)}</Text>
        <Text style={styles.chip}>{sourceLabels[note.source]}</Text>
      </View>
      {txHint ? (
        <Text
          style={txStatus === 'failed' ? styles.txFailed : styles.txPending}
        >
          {txHint}
        </Text>
      ) : null}

      {userNotes ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sua nota</Text>
          <HighlightText
            text={userNotes}
            query={searchQuery}
            style={styles.body}
          />
        </View>
      ) : null}

      {transcription ? (
        <View style={[styles.section, userNotes ? styles.sectionGap : null]}>
          <Text style={styles.sectionLabel}>Transcrição</Text>
          <HighlightText
            text={transcription}
            query={searchQuery}
            style={styles.transcription}
          />
        </View>
      ) : null}

      {!userNotes && !transcription ? (
        <HighlightText
          text={note.body}
          query={searchQuery}
          style={styles.body}
        />
      ) : null}

      {isCallNote && hasRecording ? (
        <Text style={styles.audioHint}>Áudio da sua voz disponível abaixo</Text>
      ) : null}

      <View style={styles.actions}>
        {hasRecording && onPlayRecording && Platform.OS !== 'web' ? (
          <TouchableOpacity
            onPress={onPlayRecording}
            style={styles.actionBtn}
            activeOpacity={0.6}
          >
            <Text style={styles.actionText}>
              {recordingPlaying ? 'Parar áudio' : 'Ouvir áudio'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {txStatus === 'failed' && onRetryTranscription ? (
          <Pressable onPress={onRetryTranscription} style={styles.actionBtn}>
            <Text style={styles.actionText}>Tentar transcrever</Text>
          </Pressable>
        ) : null}
        {onListen ? (
          <TouchableOpacity
            onPress={onListen}
            style={styles.actionBtn}
            activeOpacity={0.6}
          >
            <Text style={[styles.actionText, styles.tts]}>
              {ttsSpeaking ? 'Parar leitura' : 'Ouvir texto'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {onEdit ? (
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <Text style={styles.actionText}>Editar</Text>
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable onPress={onDelete} style={styles.actionBtn}>
            <Text style={[styles.actionText, styles.danger]}>Excluir</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
