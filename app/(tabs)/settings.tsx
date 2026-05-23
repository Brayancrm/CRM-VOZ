import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { ensureNotificationPermissions } from '@/services/notifications';
import { requestMicrophonePermission } from '@/services/recording';
import { useCallDetection } from '@/context/CallDetectionContext';
import {
  getTranscriptionApiUrl,
  setTranscriptionApiUrl,
  getTranscriptionApiSecret,
  setTranscriptionApiSecret,
  isTranscriptionConfigured,
} from '@/services/transcriptionConfig';
import { processTranscriptionQueue } from '@/services/transcriptionQueue';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { colors } from '@/constants/theme';

export default function SettingsScreen() {
  const { support, isListening } = useCallDetection();
  const [status, setStatus] = useState<string>('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [transcriptionStatus, setTranscriptionStatus] = useState('');

  useEffect(() => {
    void (async () => {
      setApiUrl(await getTranscriptionApiUrl());
      setApiSecret(await getTranscriptionApiSecret());
      const ok = await isTranscriptionConfigured();
      setTranscriptionStatus(
        ok
          ? 'URL configurada. Após gravar, o áudio é enviado ao servidor (Railway).'
          : 'Informe a URL do Railway (ex.: https://seu-app.up.railway.app).'
      );
    })();
  }, []);

  const saveTranscriptionConfig = async () => {
    await setTranscriptionApiUrl(apiUrl);
    await setTranscriptionApiSecret(apiSecret);
    const ok = await isTranscriptionConfigured();
    setTranscriptionStatus(
      ok ? 'Configuração salva.' : 'URL inválida — use https://...'
    );
    Alert.alert('Transcrição', ok ? 'Configuração salva.' : 'URL inválida.');
  };

  const testTranscriptionApi = async () => {
    const url = apiUrl.trim().replace(/\/$/, '');
    if (!url.startsWith('http')) {
      Alert.alert('URL inválida', 'Use https://seu-projeto.up.railway.app');
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (apiSecret.trim()) {
        headers.Authorization = `Bearer ${apiSecret.trim()}`;
      }
      const res = await fetch(`${url}/health`, { headers });
      const data = await res.json();
      if (res.ok && data.ok) {
        Alert.alert(
          'Servidor OK',
          data.whisper
            ? 'Railway online e OpenAI configurada.'
            : 'Servidor online, mas falta OPENAI_API_KEY no Railway.'
        );
      } else {
        Alert.alert('Erro', JSON.stringify(data));
      }
    } catch (e) {
      Alert.alert(
        'Falha na conexão',
        e instanceof Error ? e.message : 'Verifique URL e internet.'
      );
    }
  };

  const runQueueNow = async () => {
    await saveTranscriptionConfig();
    await processTranscriptionQueue();
    Alert.alert('Fila', 'Processamento de transcrições iniciado.');
  };

  const checkAll = async () => {
    try {
      const mic = await requestMicrophonePermission();
      const notif = await ensureNotificationPermissions();
      const { status: contactsStatus } = await Contacts.getPermissionsAsync();
      let calLine = 'não disponível';
      try {
        const cal = await Calendar.getCalendarPermissionsAsync();
        calLine = cal.status;
      } catch {
        calLine = 'módulo indisponível';
      }
      setStatus(
        `Microfone: ${mic ? 'OK' : 'negado'}\n` +
          `Notificações: ${notif ? 'OK' : 'negado'}\n` +
          `Contatos: ${contactsStatus}\n` +
          `Calendário: ${calLine}`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Erro ao ler permissões');
    }
  };

  const requestAll = async () => {
    try {
      await requestMicrophonePermission();
      await ensureNotificationPermissions();
      await Contacts.requestPermissionsAsync();
      await Calendar.requestCalendarPermissionsAsync();
      await checkAll();
      Alert.alert('Permissões', 'Solicitações enviadas ao sistema.');
    } catch (e) {
      Alert.alert(
        'Erro',
        e instanceof Error ? e.message : 'Falha ao solicitar permissões.'
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Sobre o CRM-VOZ</Text>
        <Text style={styles.body}>
          Dados e gravações ficam no celular. A transcrição (Fase 4) envia só o
          áudio da sua voz para o servidor Railway — texto volta para a nota.
        </Text>
      </View>

      {Platform.OS !== 'web' ? (
        <View style={styles.card}>
          <Text style={styles.title}>Transcrição automática (Fase 4)</Text>
          <Text style={styles.body}>{transcriptionStatus}</Text>
          <Text style={styles.label}>URL do Railway</Text>
          <TextInput
            style={styles.input}
            placeholder="https://crm-voz-api.up.railway.app"
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>Chave API (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Mesmo valor de API_SECRET no Railway"
            value={apiSecret}
            onChangeText={setApiSecret}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button title="Salvar configuração" onPress={saveTranscriptionConfig} />
          <Button
            title="Testar servidor"
            variant="secondary"
            onPress={testTranscriptionApi}
            style={styles.mt}
          />
          <Button
            title="Processar fila agora"
            variant="secondary"
            onPress={runQueueNow}
            style={styles.mt}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>Gravação manual (Fase 3)</Text>
        <Text style={styles.body}>
          {Platform.OS === 'android'
            ? support.reason ??
              'Use «Iniciar gravação» na ficha do contato.'
            : support.reason ?? 'Use «Iniciar gravação» na ficha.'}
        </Text>
      </View>

      <Button title="Solicitar permissões" onPress={requestAll} />
      <Button
        title="Ver status das permissões"
        variant="secondary"
        onPress={checkAll}
        style={styles.mt}
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <Text style={styles.footer}>
        Guia Railway: docs/FASE-4-RAILWAY.md
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  body: { fontSize: 15, color: colors.textMuted, lineHeight: 22 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.bg,
  },
  mt: { marginTop: 8 },
  status: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
  },
  footer: { fontSize: 12, color: colors.textMuted, marginTop: 24, lineHeight: 18 },
});
