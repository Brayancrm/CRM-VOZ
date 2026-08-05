import { Platform, View, Text, StyleSheet } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { DateTimeSelector } from '@/components/DateTimeSelector';
import { formatDateTime } from '@/utils/date';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { Button } from '@/components/ui/Button';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

/** Abre diálogos nativos fora do Modal RN (evita crash no Android). */
function openAndroidDateTimePicker(
  value: Date,
  onChange: (date: Date) => void
): void {
  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setFullYear(maxDate.getFullYear() + 5);

  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    is24Hour: true,
    minimumDate: new Date(now.getFullYear() - 1, 0, 1),
    maximumDate: maxDate,
    onChange: (event, pickedDate) => {
      if (event.type !== 'set' || !pickedDate) return;

      const withDate = new Date(value);
      withDate.setFullYear(
        pickedDate.getFullYear(),
        pickedDate.getMonth(),
        pickedDate.getDate()
      );

      DateTimePickerAndroid.open({
        value: withDate,
        mode: 'time',
        is24Hour: true,
        onChange: (timeEvent, pickedTime) => {
          if (timeEvent.type !== 'set' || !pickedTime) return;
          const next = new Date(withDate);
          next.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
          onChange(next);
        },
      });
    },
  });
}

function AndroidScheduleDateTimePicker({ value, onChange }: Props) {
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      block: { gap: 8, marginBottom: 4 },
      label: { fontSize: 14, fontWeight: '600', color: c.text },
      preview: { fontSize: 15, color: c.primary },
    })
  );

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Data e hora da ligação</Text>
      <Text style={styles.preview}>{formatDateTime(value.getTime())}</Text>
      <Button
        title="Escolher data e hora"
        variant="secondary"
        onPress={() => openAndroidDateTimePicker(value, onChange)}
      />
    </View>
  );
}

/** Data/hora — Android usa diálogo nativo; iOS/web mantêm seletores inline. */
export function ScheduleDateTimePicker({ value, onChange }: Props) {
  if (Platform.OS === 'android') {
    return <AndroidScheduleDateTimePicker value={value} onChange={onChange} />;
  }

  return (
    <DateTimeSelector
      value={value}
      onChange={onChange}
      label="Data e hora da ligação"
      showTime
    />
  );
}
