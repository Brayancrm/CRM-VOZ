import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { COUNTRY_DIAL_CODES } from '@/utils/countryCodes';
import { PickerField } from '@/components/PickerField';
import { colors } from '@/constants/theme';

type Props = {
  dialCode: string;
  localNumber: string;
  onDialCodeChange: (code: string) => void;
  onLocalNumberChange: (local: string) => void;
};

export function CountryPhoneInput({
  dialCode,
  localNumber,
  onDialCodeChange,
  onLocalNumberChange,
}: Props) {
  const prefixDisplay = `(+${dialCode})`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Telefone</Text>
      <View style={styles.row}>
        <View style={styles.prefixCol}>
          <PickerField
            caption="País"
            displayValue={prefixDisplay}
            selectedValue={dialCode}
            onValueChange={(v) => onDialCodeChange(String(v))}
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <Picker.Item key={c.code} label={c.label} value={c.code} />
            ))}
          </PickerField>
        </View>
        <View style={styles.numberBox}>
          <Text style={styles.caption}>Número</Text>
          <TextInput
            style={styles.input}
            placeholder="DDD + número"
            keyboardType="phone-pad"
            value={localNumber}
            onChangeText={onLocalNumberChange}
          />
        </View>
      </View>
      <Text style={styles.hint}>
        Prefixo {prefixDisplay}. Ex.: 13 99123-4567 no campo número.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  prefixCol: { width: 96 },
  numberBox: { flex: 1 },
  caption: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
});
