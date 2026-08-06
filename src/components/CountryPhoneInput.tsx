import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { COUNTRY_DIAL_CODES } from '@/utils/countryCodes';
import { PickerField } from '@/components/PickerField';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useI18n } from '@/i18n';

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
  const { t } = useI18n();
  const prefixDisplay = `(+${dialCode})`;
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      wrap: { marginBottom: 12 },
      label: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 6 },
      row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
      prefixCol: { width: 96 },
      numberBox: { flex: 1 },
      caption: {
        fontSize: 11,
        color: c.textMuted,
        marginBottom: 4,
      },
      input: {
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        backgroundColor: c.surface,
        color: c.text,
      },
      hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    })
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('contact.form.phone')}</Text>
      <View style={styles.row}>
        <View style={styles.prefixCol}>
          <PickerField
            caption={t('contact.form.country')}
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
          <Text style={styles.caption}>{t('contact.form.number')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('contact.form.numberPlaceholder')}
            keyboardType="phone-pad"
            value={localNumber}
            onChangeText={onLocalNumberChange}
          />
        </View>
      </View>
      <Text style={styles.hint}>
        {t('contact.form.prefixHint', { code: prefixDisplay })}
      </Text>
    </View>
  );
}
