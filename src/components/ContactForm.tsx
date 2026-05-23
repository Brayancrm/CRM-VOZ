import { View, TextInput, StyleSheet } from 'react-native';
import { CountryPhoneInput } from '@/components/CountryPhoneInput';
import { colors } from '@/constants/theme';

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
  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Nome"
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

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
});
