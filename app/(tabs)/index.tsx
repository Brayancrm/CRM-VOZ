import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listContacts } from '@/db/repositories/contacts';
import { importDeviceContacts } from '@/services/contactsImport';
import type { Contact } from '@/types';
import { formatPhoneDisplay } from '@/utils/phone';
import { colors } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

export default function ContactsScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await listContacts(search);
    setContacts(data);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Somente no celular',
        'Importar contatos do aparelho funciona no app Android/iOS, não no navegador.'
      );
      return;
    }
    try {
      const count = await importDeviceContacts();
      Alert.alert('Importação', `${count} contato(s) importado(s).`);
      await load();
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao importar.');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar contato..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.toolbar}>
        <Button
          title="+ Novo"
          variant="primary"
          style={styles.toolbarBtn}
          onPress={() => router.push('/contact/new')}
        />
        <Button
          title="Importar"
          variant="secondary"
          style={styles.toolbarBtn}
          onPress={handleImport}
        />
      </View>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nenhum contato. Crie um novo ou importe do celular.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/contact/${item.id}`)}
          >
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>
                {formatPhoneDisplay(item.phone_normalized)}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toolbarBtn: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  phone: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.textMuted },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 40,
    fontSize: 15,
  },
});
