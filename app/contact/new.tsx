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
import { Button } from '@/components/ui/Button';
import { ContactForm } from '@/components/ContactForm';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useI18n } from '@/i18n';

export default function NewContactScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [localPhone, setLocalPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: { flex: 1, padding: 16, backgroundColor: c.bg },
      mt: { marginTop: 8 },
    })
  );

  const save = async () => {
    const trimmedName = name.trim();
    const phone_normalized = buildPhoneNormalized(dialCode, localPhone);
    if (!trimmedName || !phone_normalized) {
      Alert.alert(t('contact.invalidTitle'), t('contact.invalidBody'));
      return;
    }
    const existing = await findContactByPhone(phone_normalized);
    if (existing) {
      Alert.alert(t('contact.duplicateTitle'), t('contact.duplicateBody'));
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
      Alert.alert(
        t('common.error'),
        e instanceof Error ? e.message : t('common.error')
      );
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
      <Button title={t('contact.save')} onPress={save} loading={saving} />
      <Button
        title={t('common.cancel')}
        variant="ghost"
        onPress={() => router.back()}
        style={styles.mt}
      />
    </KeyboardAvoidingView>
  );
}
