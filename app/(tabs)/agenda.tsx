import { useCallback, useMemo, useState, useRef } from 'react';
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
  Platform,
  InteractionManager,
  KeyboardAvoidingView,
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
import {
  listDeviceCalendarEvents,
  openDeviceCalendarEvent,
  type CalendarAccess,
} from '@/services/deviceCalendar';
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
import {
  agendaItemKey,
  mergeAgendaSections,
  type AgendaItem,
  isAppItem,
} from '@/utils/agendaMerge';
import {
  filterAgendaSections,
} from '@/utils/agendaSearch';
import { showAppAlert, showConfirm } from '@/utils/alert';
import { waitForModalClose } from '@/utils/afterModalClose';
import { useColors } from '@/context/ThemeContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ScheduleDayPicker } from '@/components/ScheduleDayPicker';
import { ScheduleDateTimePicker } from '@/components/ScheduleDateTimePicker';
import { AgendaScheduledCard } from '@/components/AgendaScheduledCard';
import { AgendaDeviceEventCard } from '@/components/AgendaDeviceEventCard';
import { Button } from '@/components/ui/Button';
import { syncDeviceCalendarReminders } from '@/services/deviceCalendarReminders';

const filters: { key: AgendaFilter; label: string }[] = [
  { key: 'upcoming', label: '2 anos' },
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

type Section = { title: string; data: AgendaItem[] };

export default function AgendaScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, padding: 16, backgroundColor: c.bg },
    search: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      marginBottom: 8,
      color: c.text,
    },
    searchHint: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 8,
      lineHeight: 18,
    },
    clearSearch: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 4 },
    clearSearchText: { fontSize: 13, fontWeight: '600', color: c.primary },
    filtersWrap: { gap: 8, marginBottom: 8 },
    filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 90,
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textMuted },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    dayPickerBox: {
      backgroundColor: c.surface,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    list: { flex: 1 },
    calendarHint: {
      fontSize: 12,
      color: c.warning,
      marginBottom: 8,
      lineHeight: 18,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
      marginBottom: 8,
      marginTop: 4,
    },
    emptyBox: { marginTop: 32, paddingHorizontal: 8 },
    empty: {
      textAlign: 'center',
      color: c.text,
      fontSize: 16,
      fontWeight: '600',
    },
    emptyHint: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    modalScroll: { maxHeight: '90%' },
    modal: {
      backgroundColor: c.surface,
      padding: 20,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      gap: 10,
      paddingBottom: 32,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: c.text },
    modalSub: { fontSize: 14, color: c.textMuted },
    modalLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    noteInput: {
      minHeight: 64,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      textAlignVertical: 'top',
      color: c.text,
      backgroundColor: c.bg,
    },
  }));
  const [filter, setFilter] = useState<AgendaFilter>('upcoming');
  const [filterDay, setFilterDay] = useState(new Date());
  const [search, setSearch] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarAccess, setCalendarAccess] = useState<CalendarAccess>('denied');

  const [rescheduleTarget, setRescheduleTarget] =
    useState<ScheduledCallWithContact | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(new Date());
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const load = useCallback(async () => {
    const { start, end } = rangeForFilter(filter, filterDay);
    const [inRange, overdue, calendarResult] = await Promise.all([
      listScheduledInRange(start, end),
      filter === 'day' ? Promise.resolve([]) : listOverduePending(),
      Platform.OS === 'web'
        ? Promise.resolve({ events: [], access: 'unavailable' as const })
        : listDeviceCalendarEvents(start, end),
    ]);

    setCalendarAccess(calendarResult.access);

    const dayTitle = describeFilterRange('day', filterDay);
    const periodTitle =
      filter === 'day' ? dayTitle : describeFilterRange(filter, filterDay);

    const nextSections = mergeAgendaSections({
      filter,
      filterDay,
      appInRange: inRange,
      appOverdue: overdue,
      deviceEvents: calendarResult.events,
      periodTitle,
      dayTitle,
    });

    setSections(nextSections);
  }, [filter, filterDay]);

  const calendarSyncAt = useRef(0);

  const filteredSections = useMemo(
    () => filterAgendaSections(sections, search),
    [sections, search]
  );

  const searchActive = search.trim().length > 0;

  useFocusEffect(
    useCallback(() => {
      void load();
      if (Platform.OS !== 'web') {
        const now = Date.now();
        if (now - calendarSyncAt.current > 5 * 60 * 1000) {
          calendarSyncAt.current = now;
          void syncDeviceCalendarReminders();
        }
      }
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
        await scheduleCallReminders(target.id, target.contact_name, newAt);
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

  const openCalendarEvent = async (eventId: string) => {
    try {
      await openDeviceCalendarEvent(eventId);
    } catch (e) {
      showAppAlert(
        'Calendário',
        e instanceof Error ? e.message : 'Não foi possível abrir o evento.'
      );
    }
  };

  const calendarHint =
    Platform.OS !== 'web' && calendarAccess === 'denied'
      ? 'Permita acesso ao calendário em Ajustes para ver eventos do celular.'
      : Platform.OS !== 'web' && calendarAccess === 'unavailable'
        ? 'Calendário do celular indisponível neste dispositivo.'
        : null;

  return (
    <View style={styles.container}>
      <SectionList
        style={styles.list}
        sections={filteredSections}
        keyExtractor={agendaItemKey}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={styles.filtersWrap}>
              <View style={styles.filtersRow}>
                {filters.slice(0, 3).map((f) => (
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
              <View style={styles.filtersRow}>
                {filters.slice(3).map((f) => (
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
            </View>

            {filter === 'day' ? (
              <View style={styles.dayPickerBox}>
                <ScheduleDayPicker value={filterDay} onChange={setFilterDay} />
              </View>
            ) : null}

            <TextInput
              style={styles.search}
              placeholder="Buscar contato, nota ou evento…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchActive ? (
              <Pressable
                onPress={() => setSearch('')}
                style={styles.clearSearch}
              >
                <Text style={styles.clearSearchText}>Limpar busca</Text>
              </Pressable>
            ) : (
              <Text style={styles.searchHint}>
                Nome, telefone, nota do agendamento ou título do calendário do
                celular.
              </Text>
            )}

            {calendarHint ? (
              <Text style={styles.calendarHint}>{calendarHint}</Text>
            ) : null}
          </>
        }
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
              {searchActive
                ? 'Nenhum compromisso corresponde à busca.'
                : filter === 'day'
                  ? 'Nenhum compromisso neste dia.'
                  : 'Nenhum compromisso neste período.'}
            </Text>
            {searchActive ? (
              <Text style={styles.emptyHint}>
                Tente outra palavra ou limpe a busca para ver todos do período.
              </Text>
            ) : filter !== 'day' ? (
              <Text style={styles.emptyHint}>
                Ligações atrasadas do app aparecem no topo. Eventos do Google
                Calendar / Samsung aparecem com etiqueta CELULAR.
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
        renderItem={({ item }) =>
          isAppItem(item) ? (
            <AgendaScheduledCard
              item={item}
              searchQuery={search.trim() || undefined}
              onToggleComplete={() => toggleComplete(item)}
              onDelete={() => removeItem(item)}
              onReschedule={() => openReschedule(item)}
              onOpenContact={() => router.push(`/contact/${item.contact_id}`)}
            />
          ) : (
            <AgendaDeviceEventCard
              item={item}
              searchQuery={search.trim() || undefined}
              onOpenInCalendar={() => openCalendarEvent(item.id)}
            />
          )
        }
        stickySectionHeadersEnabled={false}
      />

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
              style={styles.noteInput}
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
