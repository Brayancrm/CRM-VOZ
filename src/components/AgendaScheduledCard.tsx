import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ScheduledCallWithContact } from '@/types';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import {
  isScheduledCompleted,
  isScheduledOverdue,
} from '@/utils/scheduled';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

type Props = {
  item: ScheduledCallWithContact;
  onToggleComplete: () => void;
  onDelete: () => void;
  onReschedule: () => void;
  onOpenContact?: () => void;
};

export function AgendaScheduledCard({
  item,
  onToggleComplete,
  onDelete,
  onReschedule,
  onOpenContact,
}: Props) {
  const completed = isScheduledCompleted(item);
  const overdue = isScheduledOverdue(item);

  return (
    <View
      style={[
        styles.card,
        completed && styles.cardDone,
        overdue && styles.cardOverdue,
      ]}
    >
      <Pressable onPress={onOpenContact} disabled={!onOpenContact}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, completed && styles.textDone]}>
            {item.contact_name}
          </Text>
          {overdue ? (
            <Text style={styles.badgeOverdue}>ATRASADO</Text>
          ) : completed ? (
            <Text style={styles.badgeDone}>CONCLUÍDA</Text>
          ) : null}
        </View>
        <Text style={[styles.time, completed && styles.textDone]}>
          {formatDateTime(item.scheduled_at)}
        </Text>
        <Text style={styles.phone}>
          {formatPhoneDisplay(item.phone_normalized)}
        </Text>
        {item.note?.trim() ? (
          <Text
            style={[styles.scheduleNote, completed && styles.textDone]}
            numberOfLines={4}
          >
            {item.note.trim()}
          </Text>
        ) : null}
      </Pressable>

      {overdue ? (
        <Text style={styles.overdueHint}>
          Passou do horário. Reagende, marque como concluída ou exclua.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.checkRow, completed && styles.checkRowOn]}
          onPress={onToggleComplete}
        >
          <View style={[styles.checkbox, completed && styles.checkboxOn]}>
            {completed ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.checkLabel}>
            {completed ? 'Concluída' : 'Marcar concluída'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.btnRow}>
        {(overdue || !completed) && (
          <Button
            title={overdue ? 'Reagendar' : 'Alterar horário'}
            variant="secondary"
            onPress={onReschedule}
            style={styles.btnFlex}
          />
        )}
        <Button
          title="Excluir"
          variant="danger"
          onPress={onDelete}
          style={styles.btnFlex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDone: {
    opacity: 0.75,
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  cardOverdue: {
    borderColor: colors.warning,
    backgroundColor: '#FFFBEB',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  name: { fontSize: 17, fontWeight: '600', color: colors.text, flex: 1 },
  textDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  time: { fontSize: 15, color: colors.primary, marginTop: 4 },
  phone: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  scheduleNote: {
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  badgeOverdue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeDone: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    backgroundColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overdueHint: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 10,
    lineHeight: 18,
  },
  actions: { marginTop: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkRowOn: {},
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  checkLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnFlex: { flex: 1 },
});
