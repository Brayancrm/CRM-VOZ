import { useCallback, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  listScheduledInRange,
  listOverduePending,
  setScheduledCompleted,
  rescheduleScheduledCall,
  deleteScheduledCall,
} from '@/db/repositories/scheduledCalls';
import {
  scheduleCallReminders,
  cancelCallReminders,
} from '@/services/notifications';
import type { AgendaFilter, ScheduledCallWithContact } from '@/types';
import {
  formatDateTime,
  getWeekWindow,
  getMonthWindow,
  getNext7DaysWindow,
  getUpcomingWindow,
  getDayWindow,
  describeFilterRange,
} from '@/utils/date';
import { showAppAlert, showConfirm } from '@/utils/alert';
import { colors } from '@/constants/theme';
import { ScheduleDayPicker } from '@/components/ScheduleDayPicker';
import { ScheduleDateTimePicker } from '@/components/ScheduleDateTimePicker';
import { AgendaScheduledCard } from '@/components/AgendaScheduledCard';
import { Button } from '@/components/ui/Button';

const filters: { key: AgendaFilter; label: string }[] = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'day', label: 'Dia' },
  { key: 'month', label: 'Mês' },
  { key: 'week', label: 'Semana' },
  { key: 'next7', label: '7 dias (sáb→sex)' },
];

function rangeForFilter(
  filter: AgendaFilter,
  day: Date
): { start: number; end: number } {
  switch (filter) {
    case 'day':
      return getDayWindow(day);
    case 'week':
      return getWeekWindow();
    case 'month':
      return getMonthWindow();
    case 'next7':
      return getNext7DaysWindow();
    default:
      return getUpcomingWindow();
  }
}

type Section = { title: string; data: ScheduledCallWithContact[] };

export default function AgendaScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<AgendaFilter>('upcoming');
  const [filterDay, setFilterDay] = useState(new Date());
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [rescheduleTarget, setRescheduleTarget] =
    useState<ScheduledCallWithContact | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(new Date());
  const [rescheduleNote, setRescheduleNote] = useState('');

  const load = useCallback(async () => {
    const { start, end } = rangeForFilter(filter, filterDay);
    const inRange = await listScheduledInRange(start, end);

    const nextSections: Section[] = [];

    if (filter === 'day') {
      // Só o dia escolhido — sem atrasados de outros dias
      if (inRange.length > 0) {
        nextSections.push({
          title: describeFilterRange('day', filterDay),
          data: inRange,
        });
      }
    } else {
      const overdue = await listOverduePending();
      const overdueIds = new Set(overdue.map((o) => o.id));
      const mainList = inRange.filter((i) => !overdueIds.has(i.id));

      if (overdue.length > 0) {
        nextSections.push({
          title: 'Atrasados — reagende ou conclua',
          data: overdue,
        });
      }
      if (mainList.length > 0) {
        nextSections.push({
          title: overdue.length > 0 ? 'Neste período' : 'Agendamentos',
          data: mainList,
        });
      }
    }

    setSections(nextSections);

    const all = await listScheduledInRange(0, Number.MAX_SAFE_INTEGER);
    setTotalCount(all.length);
  }, [filter, filterDay]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
    try {
      await cancelCallReminders(rescheduleTarget.id);
      await rescheduleScheduledCall(rescheduleTarget.id, {
        scheduled_at: rescheduleAt.getTime(),
        note: rescheduleNote.trim(),
      });
      await scheduleCallReminders(
        rescheduleTarget.id,
        rescheduleTarget.contact_name,
        rescheduleAt.getTime()
      );
      setRescheduleTarget(null);
      showAppAlert(
        'Reagendado',
        `Nova data: ${formatDateTime(rescheduleAt.getTime())}`
      );
      await load();
    } catch (e) {
      showAppAlert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível reagendar.'
      );
    }
  };

  const toggleComplete = async (item: ScheduledCallWithContact) => {
    const next = item.completed !== 1;
    await setScheduledCompleted(item.id, next);
    if (next) {
      await cancelCallReminders(item.id);
      showAppAlert('Concluída', `Ligação com ${item.contact_name} marcada como feita.`);
    }
    await load();
  };

  const removeItem = (item: ScheduledCallWithContact) => {
    showConfirm(
      'Excluir agendamento',
      `Remover ligação com ${item.contact_name}?`,
      async () => {
        await cancelCallReminders(item.id);
        await deleteScheduledCall(item.id);
        showAppAlert('Excluído', 'Agendamento removido.');
        await load();
      }
    );
  };

  const itemCount = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.chipText,
                filter === f.key && styles.chipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filter === 'day' ? (
        <View style={styles.dayPickerBox}>
          <ScheduleDayPicker value={filterDay} onChange={setFilterDay} />
        </View>
      ) : null}

      <Text style={styles.hint}>
        {filter === 'day'
          ? itemCount > 0
            ? `${itemCount} ligação(ões) em ${describeFilterRange('day', filterDay)}`
            : `Dia ${describeFilterRange('day', filterDay)} — sem agendamentos`
          : `Período: ${describeFilterRange(filter, filterDay)}${
              totalCount > 0
                ? ` · ${itemCount} exibido(s) (${totalCount} no total)`
                : ''
            }`}
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>
              {filter === 'day'
                ? 'Nenhuma ligação neste dia.'
                : 'Nenhuma ligação neste período.'}
            </Text>
            {filter !== 'day' ? (
              <Text style={styles.emptyHint}>
                Itens atrasados aparecem no topo até você reagendar, concluir ou
                excluir.
              </Text>
            ) : (
              <Text style={styles.emptyHint}>
                Escolha outra data ou agende na ficha do contato.
              </Text>
            )}
          </View>
        }
        renderSectionHeader={({ section: { title } }) =>
          filter === 'day' ? null : (
            <Text style={styles.sectionTitle}>{title}</Text>
          )
        }
        renderItem={({ item }) => (
          <AgendaScheduledCard
            item={item}
            onToggleComplete={() => toggleComplete(item)}
            onDelete={() => removeItem(item)}
            onReschedule={() => openReschedule(item)}
            onOpenContact={() => router.push(`/contact/${item.contact_id}`)}
          />
        )}
        stickySectionHeadersEnabled={false}
      />

      <Modal visible={!!rescheduleTarget} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modal}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Reagendar ligação</Text>
            {rescheduleTarget ? (
              <Text style={styles.modalSub}>
                {rescheduleTarget.contact_name} — horário passou ou precisa
                alterar
              </Text>
            ) : null}
            <ScheduleDateTimePicker
              value={rescheduleAt}
              onChange={setRescheduleAt}
            />
            <Text style={styles.modalLabel}>Nota</Text>
            <TextInput
              style={styles.noteInput}
              value={rescheduleNote}
              onChangeText={setRescheduleNote}
              multiline
              placeholder="Nota do agendamento"
            />
            <Button title="Salvar novo horário" onPress={confirmReschedule} />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => setRescheduleTarget(null)}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dayPickerBox: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginTop: 4,
  },
  emptyBox: { marginTop: 32, paddingHorizontal: 8 },
  empty: { textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyHint: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '90%',
  },
  modal: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 10,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalSub: { fontSize: 14, color: colors.textMuted },
  modalLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  noteInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: 'top',
  },
});
