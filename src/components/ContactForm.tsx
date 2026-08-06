import { View, TextInput, StyleSheet } from 'react-native';
import { CountryPhoneInput } from '@/components/CountryPhoneInput';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useI18n } from '@/i18n';
import { useColors } from '@/context/ThemeContext';

type Props = {
  name: string;
  dialCode: string;
  localPhone: string;
  onNameChange: (v: string) => void;
  onDialCodeChange: (v: string) => void;
  onLocalPhoneChange: (v: string) => void;
};

export function ContactForm({
  name,
  dialCode,
  localPhone,
  onNameChange,
  onDialCodeChange,
  onLocalPhoneChange,
}: Props) {
  const { t } = useI18n();
  const colors = useColors();
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      input: {
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        marginBottom: 12,
        color: c.text,
      },
    })
  );

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder={t('contact.form.name')}
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={onNameChange}
      />
      <CountryPhoneInput
        dialCode={dialCode}
        localNumber={localPhone}
        onDialCodeChange={onDialCodeChange}
        onLocalNumberChange={onLocalPhoneChange}
      />
    </View>
  );
}
