import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { formatDateTime } from '@/utils/date';
import {
  buildDateFromParts,
  getDayOptions,
  getHourOptions,
  getMinuteOptions,
  getMonthOptions,
  getYearOptions,
} from '@/utils/dateParts';
import { PickerField } from '@/components/PickerField';
import { colors } from '@/constants/theme';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
  /** Se false, só dia / mês / ano */
  showTime?: boolean;
  label?: string;
};

export function DateTimeSelector({
  value,
  onChange,
  showTime = true,
  label = 'Data e hora',
}: Props) {
  const [day, setDay] = useState(value.getDate());
  const [month, setMonth] = useState(value.getMonth() + 1);
  const [year, setYear] = useState(value.getFullYear());
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());

  useEffect(() => {
    setDay(value.getDate());
    setMonth(value.getMonth() + 1);
    setYear(value.getFullYear());
    setHour(value.getHours());
    setMinute(value.getMinutes());
  }, [value.getTime()]);

  const years = useMemo(() => getYearOptions(), []);
  const months = useMemo(() => getMonthOptions(), []);
  const days = useMemo(() => getDayOptions(year, month), [year, month]);
  const hours = useMemo(() => getHourOptions(), []);
  const minutes = useMemo(() => getMinuteOptions(), []);

  const monthLabel =
    months.find((m) => m.value === month)?.label ?? String(month);

  const apply = (
    next: Partial<{
      day: number;
      month: number;
      year: number;
      hour: number;
      minute: number;
    }>
  ) => {
    const built = buildDateFromParts(
      next.day ?? day,
      next.month ?? month,
      next.year ?? year,
      next.hour ?? hour,
      next.minute ?? minute
    );
    setDay(built.getDate());
    setMonth(built.getMonth() + 1);
    setYear(built.getFullYear());
    setHour(built.getHours());
    setMinute(built.getMinutes());
    onChange(built);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.preview}>{formatDateTime(value.getTime())}</Text>

      <Text style={styles.groupLabel}>Dia · Mês · Ano</Text>
      <View style={styles.row}>
        <PickerField
          caption="Dia"
          displayValue={String(day)}
          selectedValue={day}
          onValueChange={(v) => apply({ day: Number(v) })}
        >
          {days.map((d) => (
            <Picker.Item key={d} label={String(d)} value={d} />
          ))}
        </PickerField>
        <PickerField
          caption="Mês"
          displayValue={monthLabel}
          selectedValue={month}
          onValueChange={(v) => apply({ month: Number(v) })}
          wide
        >
          {months.map((m) => (
            <Picker.Item key={m.value} label={m.label} value={m.value} />
          ))}
        </PickerField>
        <PickerField
          caption="Ano"
          displayValue={String(year)}
          selectedValue={year}
          onValueChange={(v) => apply({ year: Number(v) })}
          year
        >
          {years.map((y) => (
            <Picker.Item key={y} label={String(y)} value={y} />
          ))}
        </PickerField>
      </View>

      {showTime ? (
        <>
          <Text style={styles.groupLabel}>Hora · Minuto</Text>
          <View style={styles.row}>
            <PickerField
              caption="Hora"
              displayValue={String(hour).padStart(2, '0')}
              selectedValue={hour}
              onValueChange={(v) => apply({ hour: Number(v) })}
              half
            >
              {hours.map((h) => (
                <Picker.Item
                  key={h}
                  label={String(h).padStart(2, '0')}
                  value={h}
                />
              ))}
            </PickerField>
            <PickerField
              caption="Minuto"
              displayValue={String(minute).padStart(2, '0')}
              selectedValue={minute}
              onValueChange={(v) => apply({ minute: Number(v) })}
              half
            >
              {minutes.map((m) => (
                <Picker.Item
                  key={m}
                  label={String(m).padStart(2, '0')}
                  value={m}
                />
              ))}
            </PickerField>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  preview: { fontSize: 15, color: colors.primary, marginBottom: 4 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
});
