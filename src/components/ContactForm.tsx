import { View, TextInput, StyleSheet } from 'react-native';
import { CountryPhoneInput } from '@/components/CountryPhoneInput';
import { useThemedStyles } from '@/hooks/useThemedStyles';

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
      },
    })
  );

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

// styles gerados pelo useThemedStyles (dark mode consistente)
