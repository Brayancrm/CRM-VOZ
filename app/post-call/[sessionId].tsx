import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { getContactById } from '@/db/repositories/contacts';
import { getCallSessionById } from '@/db/repositories/callSessions';
import { reconcileCallSessionContact } from '@/services/callContactReconcile';
import { listNotesByContact, updateNote, createNote } from '@/db/repositories/notes';
import type { Contact, Note } from '@/types';
import { formatDateTime } from '@/utils/date';
import { showAppAlert } from '@/utils/alert';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { createId } from '@/utils/id';
import { formatPhoneDisplay } from '@/utils/phone';
import { DictateNoteButton } from '@/components/DictateNoteButton';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';

export default function PostCallScreen() {
  const router = useRouter();
  const { openAssistant } = useSecretinaAssistant();
  const { sessionId, contactId, noteId } = useLocalSearchParams<{
    sessionId: string;
    contactId: string;
    noteId?: string;
  }>();

  const [contact, setContact] = useState<Contact | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [userNote, setUserNote] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      scroll: { flex: 1, backgroundColor: c.bg },
      container: { padding: 20, gap: 12, paddingBottom: 40 },
      centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
      title: { fontSize: 22, fontWeight: '700', color: c.text },
      subtitle: { fontSize: 18, color: c.primary, fontWeight: '600' },
      phone: { fontSize: 14, color: c.textMuted },
      hint: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
      label: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 8 },
      inputUser: {
        minHeight: 140,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 12,
        fontSize: 16,
        textAlignVertical: 'top',
        backgroundColor: c.surface,
        color: c.text,
      },
      meta: { fontSize: 12, color: c.textMuted },
      muted: { color: c.textMuted },
    })
  );

  const load = useCallback(async () => {
    if (!sessionId) return;
    const reconciled = await reconcileCallSessionContact(sessionId);
    const effectiveContactId =
      reconciled?.contactId ?? contactId ?? '';
    if (!effectiveContactId) return;

    const c = await getContactById(effectiveContactId);
    setContact(c);

    const notes = await listNotesByContact(effectiveContactId);
    let target =
      (noteId ? notes.find((n) => n.id === noteId) : null) ??
      notes.find((n) => n.call_session_id === sessionId) ??
      null;

    if (!target) {
      const session = await getCallSessionById(sessionId);
      const id = createId();
      await createNote({
        id,
        contact_id: effectiveContactId,
        call_session_id: sessionId,
        body: '',
        source: 'post_call',
        created_at: session?.ended_at ?? Date.now(),
      });
      target = {
        id,
        contact_id: effectiveContactId,
        call_session_id: sessionId,
        body: '',
        source: 'post_call',
        created_at: session?.ended_at ?? Date.now(),
      };
    }

    setNote(target);
    setUserNote((prev) => (prev.trim() ? prev : target!.body ?? ''));
  }, [contactId, sessionId, noteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const saveAndOpenContact = async () => {
    if (!contact || !note) return;
    setSaving(true);
    try {
      await updateNote(note.id, userNote.trim());
      router.replace(`/contact/${contact.id}`);
    } catch (e) {
      showAppAlert(
        'Erro ao salvar',
        e instanceof Error ? e.message : 'Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Carregando contato…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Ligação encerrada</Text>
      <Text style={styles.subtitle}>{contact.name}</Text>
      <Text style={styles.phone}>
        {formatPhoneDisplay(contact.phone_normalized)}
      </Text>
      <Text style={styles.hint}>
        Fale a nota ou escreva. Ela fica no perfil de {contact.name}.
      </Text>

      <Text style={styles.label}>Sua nota</Text>
      <TextInput
        style={styles.inputUser}
        multiline
        placeholder="Ex.: cliente pediu orçamento, retornar na sexta…"
        value={userNote}
        onChangeText={setUserNote}
      />

      {Platform.OS !== 'web' ? (
        <DictateNoteButton
          title="Falar nota"
          disabled={saving}
          onTranscript={(text) => {
            setUserNote((prev) => {
              const base = prev.trim();
              return base ? `${base}\n${text}` : text;
            });
          }}
        />
      ) : null}

      {note ? (
        <Text style={styles.meta}>
          {formatDateTime(note.created_at)}
        </Text>
      ) : null}

      <Button
        title="Salvar e ir para o contato"
        onPress={() => void saveAndOpenContact()}
        disabled={saving}
      />
      {Platform.OS !== 'web' ? (
        <Button
          title="Outro comando (SeCretina)"
          variant="ghost"
          onPress={() => openAssistant()}
        />
      ) : null}
      <Button
        title="Ir para o contato sem salvar"
        variant="ghost"
        onPress={() => router.replace(`/contact/${contact.id}`)}
      />
    </ScrollView>
  );
}
