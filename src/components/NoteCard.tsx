import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import type { Note } from '@/types';
import { formatDateTime } from '@/utils/date';
import { colors } from '@/constants/theme';

const sourceLabels: Record<Note['source'], string> = {
  call_mic: 'Chamada (sua voz)',
  voice: 'Voz manual',
  typed: 'Digitado',
  post_call: 'Pós-chamada',
};

type Props = {
  note: Note;
  hasRecording?: boolean;
  recordingPlaying?: boolean;
  onPlayRecording?: () => void;
  onListen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function NoteCard({
  note,
  hasRecording,
  recordingPlaying,
  onPlayRecording,
  onListen,
  onEdit,
  onDelete,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDateTime(note.created_at)}</Text>
        <Text style={styles.chip}>{sourceLabels[note.source]}</Text>
      </View>
      <Text style={styles.body}>{note.body}</Text>
      <View style={styles.actions}>
        {hasRecording && onPlayRecording && Platform.OS !== 'web' ? (
          <Pressable onPress={onPlayRecording} style={styles.actionBtn}>
            <Text style={styles.actionText}>
              {recordingPlaying ? 'Parar áudio' : 'Ouvir áudio'}
            </Text>
          </Pressable>
        ) : null}
        {onListen ? (
          <Pressable onPress={onListen} style={styles.actionBtn}>
            <Text style={[styles.actionText, styles.tts]}>OUVIR texto</Text>
          </Pressable>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  date: { fontSize: 12, color: colors.textMuted, flex: 1 },
  chip: {
    fontSize: 11,
    color: colors.chipText,
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  actionBtn: { paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  tts: { color: colors.textMuted },
  danger: { color: colors.danger },
});
