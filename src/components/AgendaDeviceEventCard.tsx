import { View, Text, StyleSheet } from 'react-native';
import type { DeviceCalendarEvent } from '@/types';
import { formatEventTime } from '@/utils/date';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { HighlightText } from '@/components/HighlightText';

type Props = {
  item: DeviceCalendarEvent;
  searchQuery?: string;
  onOpenInCalendar?: () => void;
};

export function AgendaDeviceEventCard({
  item,
  searchQuery,
  onOpenInCalendar,
}: Props) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      card: {
        backgroundColor: c.deviceCardBg,
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: c.deviceCardBorder,
      },
      rowTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
      },
      name: { fontSize: 17, fontWeight: '600', color: c.text, flex: 1 },
      badgeDevice: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
        backgroundColor: c.deviceAccent,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
      },
      time: { fontSize: 15, color: c.deviceAccent, marginTop: 4, fontWeight: '500' },
      calendar: { fontSize: 13, color: c.textMuted, marginTop: 2 },
      meta: { fontSize: 14, color: c.text, marginTop: 8 },
      notes: {
        fontSize: 14,
        color: c.textMuted,
        marginTop: 6,
        fontStyle: 'italic',
        lineHeight: 20,
      },
      openBtn: { marginTop: 10 },
    })
  );

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <HighlightText
          text={item.title}
          query={searchQuery}
          style={styles.name}
        />
        <Text style={styles.badgeDevice}>CELULAR</Text>
      </View>
      <Text style={styles.time}>
        {formatEventTime(item.startAt, item.endAt, item.allDay)}
      </Text>
      <Text style={styles.calendar}>{item.calendarTitle}</Text>
      {item.location ? (
        <Text style={styles.meta} numberOfLines={2}>
          Local: {item.location}
        </Text>
      ) : null}
      {item.notes ? (
        <HighlightText
          text={item.notes}
          query={searchQuery}
          style={styles.notes}
        />
      ) : null}
      {onOpenInCalendar ? (
        <Button
          title="Abrir no calendário"
          variant="secondary"
          onPress={onOpenInCalendar}
          style={styles.openBtn}
        />
      ) : null}
    </View>
  );
}

// styles gerados pelo useThemedStyles (dark mode consistente)
