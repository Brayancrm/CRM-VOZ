import { useState } from 'react';
import {
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createContact, findContactByPhone } from '@/db/repositories/contacts';
import { buildPhoneNormalized } from '@/utils/phone';
import { DEFAULT_DIAL_CODE } from '@/utils/countryCodes';
import { createId } from '@/utils/id';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { ContactForm } from '@/components/ContactForm';

export default function NewContactScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [localPhone, setLocalPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmedName = name.trim();
    const phone_normalized = buildPhoneNormalized(dialCode, localPhone);
    if (!trimmedName || !phone_normalized) {
      Alert.alert('Dados inválidos', 'Informe nome e telefone.');
      return;
    }
    const existing = await findContactByPhone(phone_normalized);
    if (existing) {
      Alert.alert('Duplicado', 'Já existe contato com este telefone.');
      return;
    }
    setSaving(true);
    try {
      const contact = await createContact({
        id: createId(),
        name: trimmedName,
        phone_normalized,
      });
      router.replace(`/contact/${contact.id}`);
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ContactForm
        name={name}
        dialCode={dialCode}
        localPhone={localPhone}
        onNameChange={setName}
        onDialCodeChange={setDialCode}
        onLocalPhoneChange={setLocalPhone}
      />
      <Button title="Salvar contato" onPress={save} loading={saving} />
      <Button
        title="Cancelar"
        variant="ghost"
        onPress={() => router.back()}
        style={styles.mt}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  mt: { marginTop: 8 },
});
