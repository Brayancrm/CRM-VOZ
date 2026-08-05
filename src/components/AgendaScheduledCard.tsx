import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ScheduledCallWithContact } from '@/types';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';
import {
  isScheduledCompleted,
  isScheduledOverdue,
} from '@/utils/scheduled';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { HighlightText } from '@/components/HighlightText';

type Props = {
  item: ScheduledCallWithContact;
  compact?: boolean;
  searchQuery?: string;
  onToggleComplete: () => void;
  onDelete: () => void;
  onReschedule: () => void;
  onOpenContact?: () => void;
};

export function AgendaScheduledCard({
  item,
  compact,
  searchQuery,
  onToggleComplete,
  onDelete,
  onReschedule,
  onOpenContact,
}: Props) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        backgroundColor: c.surface,
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: c.border,
      },
      cardDone: {
        opacity: 0.75,
        borderColor: c.primaryDark,
        backgroundColor: c.transcriptionBg,
      },
      cardOverdue: {
        borderColor: c.warning,
        backgroundColor: c.surface,
      },
      rowTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
      },
      badges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        justifyContent: 'flex-end',
      },
      badgeApp: {
        fontSize: 11,
        fontWeight: '700',
        color: c.chipText,
        backgroundColor: c.chip,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
      },
      name: { fontSize: 17, fontWeight: '600', color: c.text, flex: 1 },
      textDone: { textDecorationLine: 'line-through', color: c.textMuted },
      time: { fontSize: 15, color: c.primary, marginTop: 4 },
      phone: { fontSize: 14, color: c.textMuted, marginTop: 2 },
      scheduleNote: {
        fontSize: 14,
        color: c.text,
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
        borderColor: c.primary,
        alignItems: 'center',
        justifyContent: 'center',
      },
      checkboxOn: {
        backgroundColor: c.primary,
        borderColor: c.primary,
      },
      checkMark: { color: '#fff', fontWeight: '700', fontSize: 14 },
      checkLabel: { fontSize: 15, color: c.text, fontWeight: '500' },
      btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
      btnFlex: { flex: 1 },
    })
  );

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
      <Pressable onPress={onOpenContact} disabled={!onOpenContact || compact}>
        {!compact ? (
          <View style={styles.rowTop}>
            <HighlightText
              text={item.contact_name}
              query={searchQuery}
              style={[styles.name, completed && styles.textDone]}
            />
            <View style={styles.badges}>
              <Text style={styles.badgeApp}>APP</Text>
              {overdue ? (
                <Text style={styles.badgeOverdue}>ATRASADO</Text>
              ) : completed ? (
                <Text style={styles.badgeDone}>CONCLUÍDA</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.rowTop}>
            <Text style={[styles.time, { marginTop: 0, flex: 1 }, completed && styles.textDone]}>
              {formatDateTime(item.scheduled_at)}
            </Text>
            <View style={styles.badges}>
              {overdue ? (
                <Text style={styles.badgeOverdue}>ATRASADO</Text>
              ) : completed ? (
                <Text style={styles.badgeDone}>CONCLUÍDA</Text>
              ) : (
                <Text style={styles.badgeApp}>PRÓXIMA</Text>
              )}
            </View>
          </View>
        )}
        {!compact ? (
          <Text style={[styles.time, completed && styles.textDone]}>
            {formatDateTime(item.scheduled_at)}
          </Text>
        ) : null}
        {!compact ? (
          <Text style={styles.phone}>
            {formatPhoneDisplay(item.phone_normalized)}
          </Text>
        ) : null}
        {item.note?.trim() ? (
          <HighlightText
            text={item.note.trim()}
            query={searchQuery}
            style={[styles.scheduleNote, completed && styles.textDone]}
          />
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

// styles gerados pelo useThemedStyles (dark mode consistente)
