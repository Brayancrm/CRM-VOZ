import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listContacts } from '@/db/repositories/contacts';
import { searchNotesGlobally } from '@/db/repositories/noteSearch';
import type { NoteSearchHit } from '@/db/repositories/noteSearch.types';
import { importDeviceContacts } from '@/services/contactsImport';
import type { Contact } from '@/types';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatDateTime } from '@/utils/date';
import { useColors } from '@/context/ThemeContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { Button } from '@/components/ui/Button';
import { HighlightText } from '@/components/HighlightText';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';
import { useI18n } from '@/i18n';

type HomeListItem =
  | { kind: 'section'; id: string; title: string }
  | { kind: 'contact'; id: string; contact: Contact }
  | { kind: 'note'; id: string; hit: NoteSearchHit };

export default function ContactsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const { openAssistant, wakeEnabled, wakeListening, wakeName } =
    useSecretinaAssistant();
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, padding: 16, backgroundColor: c.bg },
    list: { flex: 1 },
    search: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      marginBottom: 8,
      color: c.text,
    },
    searchHint: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 12,
      lineHeight: 18,
    },
    toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    toolbarBtn: { flex: 1 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    noteRow: {
      backgroundColor: c.surface,
      padding: 14,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    name: { fontSize: 17, fontWeight: '600', color: c.text },
    phone: { fontSize: 14, color: c.textMuted, marginTop: 2 },
    snippet: { fontSize: 14, color: c.text, marginTop: 6, lineHeight: 20 },
    noteMeta: { fontSize: 12, color: c.textMuted, marginTop: 4 },
    chevron: { fontSize: 24, color: c.textMuted },
    empty: {
      textAlign: 'center',
      color: c.textMuted,
      marginTop: 40,
      fontSize: 15,
    },
  }));
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [noteHits, setNoteHits] = useState<NoteSearchHit[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const trimmed = search.trim();
    const data = await listContacts(trimmed);
    setContacts(data);
    if (trimmed.length >= 2) {
      setNoteHits(await searchNotesGlobally(trimmed));
    } else {
      setNoteHits([]);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const listItems = useMemo((): HomeListItem[] => {
    const trimmed = search.trim();
    if (!trimmed) {
      return contacts.map((contact) => ({
        kind: 'contact',
        id: `contact-${contact.id}`,
        contact,
      }));
    }

    const items: HomeListItem[] = [];
    if (contacts.length > 0) {
      items.push({
        kind: 'section',
        id: 'section-contacts',
        title: t('contacts.section.contacts'),
      });
      for (const contact of contacts) {
        items.push({
          kind: 'contact',
          id: `contact-${contact.id}`,
          contact,
        });
      }
    }

    if (noteHits.length > 0) {
      items.push({
        kind: 'section',
        id: 'section-notes',
        title: t('contacts.section.notes'),
      });
      for (const hit of noteHits) {
        items.push({
          kind: 'note',
          id: `note-${hit.noteId}`,
          hit,
        });
      }
    }

    return items;
  }, [contacts, noteHits, search, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(t('contacts.alert.webTitle'), t('contacts.alert.webBody'));
      return;
    }
    try {
      const count = await importDeviceContacts();
      Alert.alert(
        t('contacts.alert.importTitle'),
        t('contacts.alert.importCount', { count })
      );
      await load();
    } catch (e) {
      Alert.alert(
        t('common.error'),
        e instanceof Error ? e.message : t('contacts.alert.importError')
      );
    }
  };

  const openNoteHit = (hit: NoteSearchHit) => {
    router.push({
      pathname: '/contact/[id]',
      params: { id: hit.contactId, q: search.trim() },
    });
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder={t('contacts.search.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      {search.trim().length > 0 && search.trim().length < 2 ? (
        <Text style={styles.searchHint}>{t('contacts.search.hintMin')}</Text>
      ) : search.trim().length >= 2 ? (
        <Text style={styles.searchHint}>{t('contacts.search.hintActive')}</Text>
      ) : null}
      <View style={styles.toolbar}>
        <Button
          title={t('contacts.action.new')}
          variant="primary"
          style={styles.toolbarBtn}
          onPress={() => router.push('/contact/new')}
        />
        <Button
          title={t('contacts.action.import')}
          variant="secondary"
          style={styles.toolbarBtn}
          onPress={handleImport}
        />
      </View>
      {Platform.OS !== 'web' ? (
        <>
          <Button
            title={t('contacts.action.talk')}
            variant="secondary"
            onPress={() =>
              openAssistant({ autoListen: true, greetFirst: true })
            }
            style={{ marginBottom: 8 }}
          />
          {wakeEnabled ? (
            <Text style={[styles.searchHint, { marginBottom: 12 }]}>
              {wakeListening
                ? t('contacts.wake.listening', { name: wakeName })
                : t('contacts.wake.active', { name: wakeName })}
            </Text>
          ) : (
            <Text style={[styles.searchHint, { marginBottom: 12 }]}>
              {t('contacts.wake.disabled')}
            </Text>
          )}
        </>
      ) : null}
      <FlatList
        style={styles.list}
        data={listItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search.trim()
              ? t('contacts.empty.search')
              : t('contacts.empty.default')}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return <Text style={styles.sectionTitle}>{item.title}</Text>;
          }
          if (item.kind === 'contact') {
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/contact/${item.contact.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <HighlightText
                    text={item.contact.name}
                    query={search}
                    style={styles.name}
                  />
                  <Text style={styles.phone}>
                    {formatPhoneDisplay(item.contact.phone_normalized)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              style={styles.noteRow}
              onPress={() => openNoteHit(item.hit)}
            >
              <Text style={styles.name}>{item.hit.contactName}</Text>
              <HighlightText
                text={item.hit.snippet}
                query={search}
                style={styles.snippet}
              />
              <Text style={styles.noteMeta}>
                {formatDateTime(item.hit.noteCreatedAt)}
                {item.hit.matchedInTranscription
                  ? ` ${t('contacts.note.transcription')}`
                  : ''}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
