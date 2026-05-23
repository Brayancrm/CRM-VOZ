import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getContactById,
  updateContact,
  findContactByPhone,
} from '@/db/repositories/contacts';
import { buildPhoneNormalized, splitPhoneNormalized } from '@/utils/phone';
import { DEFAULT_DIAL_CODE } from '@/utils/countryCodes';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { ContactForm } from '@/components/ContactForm';

export default function EditContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [localPhone, setLocalPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getContactById(id).then((c) => {
      if (c) {
        setName(c.name);
        const split = splitPhoneNormalized(c.phone_normalized);
        setDialCode(split.dialCode);
        setLocalPhone(split.local);
      }
      setLoading(false);
    });
  }, [id]);

  const save = async () => {
    if (!id) return;
    const trimmedName = name.trim();
    const phone_normalized = buildPhoneNormalized(dialCode, localPhone);
    if (!trimmedName || !phone_normalized) {
      Alert.alert('Dados inválidos', 'Informe nome e telefone.');
      return;
    }
    const existing = await findContactByPhone(phone_normalized);
    if (existing && existing.id !== id) {
      Alert.alert('Duplicado', 'Outro contato já usa este telefone.');
      return;
    }
    setSaving(true);
    try {
      await updateContact(id, {
        name: trimmedName,
        phone_normalized,
      });
      router.replace(`/contact/${id}`);
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Carregando...</Text>
      </View>
    );
  }

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
      <Button title="Salvar alterações" onPress={save} loading={saving} />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: colors.textMuted },
  mt: { marginTop: 8 },
});
