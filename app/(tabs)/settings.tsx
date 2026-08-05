import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Pressable,
  Linking,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import {
  ensureNotificationPermissions,
  rescheduleAllPendingCallReminders,
} from '@/services/notifications';
import { syncDeviceCalendarReminders } from '@/services/deviceCalendarReminders';
import {
  formatMinutesBeforeLabel,
  getReminderMinutesBefore,
  getRemindAtEventTime,
  normalizeNewReminderMinutes,
  setReminderMinutesBefore,
  setRemindAtEventTime,
} from '@/services/reminderSettings';
import {
  hasPhoneStatePermission,
  hasCallLogPermission,
  requestPhoneStatePermission,
} from '@/services/phonePermissions';
import { useCallDetection } from '@/context/CallDetectionContext';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';
import {
  isBatteryOptimizationDisabled,
  requestIgnoreBatteryOptimizations,
} from '@/services/deviceSetup';
import {
  canDrawOverlays,
  enableSecretinaBubble,
  isBubbleOverlaySupported,
  isSecretinaBubbleEnabled,
  openOverlayPermissionSettings,
  stopSecretinaBubble,
} from '@/services/secretinaBubble';
import {
  clearLegacyOpenAiApiKey,
  getVoiceGender,
  getWakeName,
  setVoiceGender,
  setWakeName,
  type SecretinaVoiceGender,
} from '@/services/secretinaSettings';
import { speakText, prefetchPodeFalar } from '@/services/speech';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { useColors } from '@/context/ThemeContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';

export default function SettingsScreen() {
  const { support, isListening, restartDetection, lastPhoneEvent } =
    useCallDetection();
  const {
    wakeEnabled,
    setWakeEnabled,
    wakeListening,
    openAssistant,
    wakeName,
    refreshWakeName,
  } = useSecretinaAssistant();
  const [bubbleOn, setBubbleOn] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [wakeNameInput, setWakeNameInput] = useState('SeCretina');
  const [voiceGender, setVoiceGenderState] =
    useState<SecretinaVoiceGender>('female');
  const colors = useColors();
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    card: {
      backgroundColor: c.surface,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    body: { fontSize: 15, color: c.textMuted, lineHeight: 22 },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
      marginTop: 10,
      marginBottom: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      backgroundColor: c.bg,
      color: c.text,
    },
    mt: { marginTop: 8 },
    reminderList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    reminderChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.chip,
      paddingLeft: 10,
      paddingRight: 4,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 4,
    },
    reminderChipText: { fontSize: 13, color: c.chipText, fontWeight: '600' },
    reminderRemove: { padding: 4 },
    reminderRemoveText: { fontSize: 14, color: c.textMuted, fontWeight: '700' },
    addReminderRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
    addReminderInput: { flex: 1, marginTop: 0 },
    addReminderBtn: { paddingHorizontal: 12, minWidth: 100 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 12,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: c.primary },
    checkMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
    toggleLabel: { fontSize: 15, color: c.text, flex: 1 },
    status: {
      fontFamily: 'monospace',
      fontSize: 13,
      color: c.text,
      backgroundColor: c.surface,
      padding: 12,
      borderRadius: 8,
    },
    footer: { fontSize: 12, color: c.textMuted, marginTop: 24, lineHeight: 18 },
  }));
  const [status, setStatus] = useState<string>('');
  const [reminderMinutes, setReminderMinutes] = useState<number[]>([60, 5]);
  const [remindAtTime, setRemindAtTime] = useState(true);
  const [newReminderInput, setNewReminderInput] = useState('');

  const loadReminders = async () => {
    setReminderMinutes(await getReminderMinutesBefore());
    setRemindAtTime(await getRemindAtEventTime());
  };

  useEffect(() => {
    void loadReminders();
    void (async () => {
      setWakeNameInput(await getWakeName());
      setVoiceGenderState(await getVoiceGender());
      // Privacidade: apaga sk- antiga se ainda existir no telemóvel
      await clearLegacyOpenAiApiKey();
      void prefetchPodeFalar();
    })();
  }, []);

  const refreshBubbleState = async () => {
    if (!isBubbleOverlaySupported()) {
      setBubbleOn(false);
      setOverlayOk(false);
      return;
    }
    try {
      setOverlayOk(await canDrawOverlays());
      setBubbleOn(await isSecretinaBubbleEnabled());
    } catch {
      setBubbleOn(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void checkAll();
      void refreshBubbleState();
    }, [])
  );

  const addReminderOffset = () => {
    const minutes = normalizeNewReminderMinutes(newReminderInput);
    if (minutes === null) {
      Alert.alert(
        'Valor inválido',
        'Use um número entre 1 e 10080 (7 dias), em minutos.'
      );
      return;
    }
    if (reminderMinutes.includes(minutes)) {
      Alert.alert('Duplicado', 'Esse lembrete já está na lista.');
      return;
    }
    setReminderMinutes((prev) =>
      [...prev, minutes].sort((a, b) => b - a)
    );
    setNewReminderInput('');
  };

  const removeReminderOffset = (minutes: number) => {
    if (reminderMinutes.length <= 1) {
      Alert.alert(
        'Mínimo um lembrete',
        'Mantenha pelo menos um aviso antes da ligação.'
      );
      return;
    }
    setReminderMinutes((prev) => prev.filter((m) => m !== minutes));
  };

  const saveReminderSettings = async () => {
    try {
      await setReminderMinutesBefore(reminderMinutes);
      await setRemindAtEventTime(remindAtTime);
      const ok = await ensureNotificationPermissions();
      const calCount = await syncDeviceCalendarReminders();
      Alert.alert(
        'Lembretes salvos',
        ok
          ? `Configuração aplicada. ${calCount} evento(s) do calendário com lembrete.`
          : 'Salvo, mas ative notificações do app nas configurações do celular.'
      );
    } catch (e) {
      Alert.alert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível salvar.'
      );
    }
  };

  const applyRemindersToPending = async () => {
    try {
      await setReminderMinutesBefore(reminderMinutes);
      await setRemindAtEventTime(remindAtTime);
      const { appCalls, calendarEvents } = await rescheduleAllPendingCallReminders();
      Alert.alert(
        'Lembretes atualizados',
        `${appCalls} ligação(ões) APP · ${calendarEvents} evento(s) do calendário do celular.`
      );
    } catch (e) {
      Alert.alert(
        'Erro',
        e instanceof Error ? e.message : 'Falha ao reaplicar lembretes.'
      );
    }
  };

  const checkAll = async () => {
    try {
      const notif = await ensureNotificationPermissions();
      const phone =
        Platform.OS === 'android' ? await hasPhoneStatePermission() : null;
      const callLog =
        Platform.OS === 'android' ? await hasCallLogPermission() : null;
      const { status: contactsStatus } = await Contacts.getPermissionsAsync();
      let calLine = 'não disponível';
      try {
        const cal = await Calendar.getCalendarPermissionsAsync();
        calLine = cal.status;
      } catch {
        calLine = 'módulo indisponível';
      }
      setStatus(
        `Notificações: ${notif ? 'OK' : 'negado'}\n` +
          (Platform.OS === 'android'
            ? `Telefone (detecção): ${phone ? 'OK' : 'negado'}\n` +
              `Registro de chamadas: ${callLog ? 'OK' : 'negado'}\n`
            : '') +
          `Detecção automática: ${support.supported ? (isListening ? 'ativa ✓' : 'não iniciou — toque Ativar detecção') : 'indisponível'}\n` +
          (Platform.OS === 'android'
            ? `Bateria sem restrições: ${(await isBatteryOptimizationDisabled()) ? 'OK ✓' : 'NÃO — toque abaixo (obrigatório)'}\n`
            : '') +
          `Contatos: ${contactsStatus}\n` +
          `Calendário: ${calLine}`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Erro ao ler permissões');
    }
  };

  const requestAll = async () => {
    try {
      if (Platform.OS === 'android') {
        await requestPhoneStatePermission();
      }
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
        <Text style={styles.title}>Sobre o SeCretina</Text>
        <Text style={styles.body}>
          CRM simples: após cada ligação, identifica o contacto e abre uma nota.
          Use o chamamento por voz ou «Falar com SeCretina» para notas e
          agendamentos — com OpenAI, num só pedido.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Voz da SeCretina</Text>
        <Text style={styles.body}>
          Escolha o timbre da assistente. A voz natural e a interpretação usam
          o servidor da app (configurado no build) — sem chave no telemóvel.
        </Text>
        <Text style={styles.label}>Timbre (pt-BR natural)</Text>
        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.checkbox,
              voiceGender === 'female' && styles.checkboxOn,
            ]}
            onPress={async () => {
              await setVoiceGender('female');
              setVoiceGenderState('female');
              void prefetchPodeFalar();
            }}
          >
            {voiceGender === 'female' ? (
              <Text style={styles.checkMark}>✓</Text>
            ) : null}
          </Pressable>
          <Text style={styles.toggleLabel}>Feminina (Coral)</Text>
        </View>
        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.checkbox,
              voiceGender === 'male' && styles.checkboxOn,
            ]}
            onPress={async () => {
              await setVoiceGender('male');
              setVoiceGenderState('male');
              void prefetchPodeFalar();
            }}
          >
            {voiceGender === 'male' ? (
              <Text style={styles.checkMark}>✓</Text>
            ) : null}
          </Pressable>
          <Text style={styles.toggleLabel}>Masculina (Ash)</Text>
        </View>
        <Button
          title="Testar voz («Pode falar»)"
          variant="secondary"
          onPress={async () => {
            try {
              const r = await speakText('Pode falar.');
              if (!r.heard) {
                Alert.alert(
                  'Voz',
                  'Não ouvi a reprodução. Confirme internet e o volume do telemóvel.'
                );
              }
            } catch (e) {
              Alert.alert(
                'Voz',
                e instanceof Error ? e.message : 'Falha ao testar a voz.'
              );
            }
          }}
          style={styles.mt}
        />
      </View>

      {Platform.OS === 'android' ? (
        <View style={styles.card}>
          <Text style={styles.title}>Chamamento por voz</Text>
          <Text style={styles.body}>
            Com o app aberto, diga «Olá {wakeName}». Ela responde «Pode falar» e
            abre o microfone. Não funciona com o ecrã bloqueado.
          </Text>
          <Text style={styles.label}>Nome de chamamento</Text>
          <TextInput
            style={styles.input}
            value={wakeNameInput}
            onChangeText={setWakeNameInput}
            placeholder="SeCretina"
            autoCapitalize="words"
          />
          <Button
            title="Guardar nome"
            variant="secondary"
            onPress={async () => {
              await setWakeName(wakeNameInput);
              await refreshWakeName();
              Alert.alert(
                'Chamamento',
                `Agora diga «Olá ${(await getWakeName())}».`
              );
            }}
            style={styles.mt}
          />
          <Text style={[styles.body, styles.mt]}>
            Estado:{' '}
            {wakeEnabled
              ? wakeListening
                ? 'escutando…'
                : 'activo (à espera)'
              : 'desligado'}
          </Text>
          <Button
            title={
              wakeEnabled
                ? `Desactivar «Olá ${wakeName}»`
                : `Activar «Olá ${wakeName}»`
            }
            onPress={async () => {
              try {
                await setWakeEnabled(!wakeEnabled);
                Alert.alert(
                  'Chamamento',
                  !wakeEnabled
                    ? `Activo. Diga «Olá ${wakeName}» com o app aberto.`
                    : 'Desactivado.'
                );
              } catch (e) {
                Alert.alert(
                  'Permissão',
                  e instanceof Error ? e.message : 'Não foi possível activar.'
                );
              }
            }}
            style={styles.mt}
          />
          <Button
            title="Abrir Falar com SeCretina"
            variant="secondary"
            onPress={() =>
              openAssistant({ autoListen: true, greetFirst: true })
            }
            style={styles.mt}
          />
        </View>
      ) : null}

      {Platform.OS === 'android' && isBubbleOverlaySupported() ? (
        <View style={styles.card}>
          <Text style={styles.title}>Bolha flutuante</Text>
          <Text style={styles.body}>
            Ícone «S» solto sobre outros apps. Requer APK novo (não basta a
            permissão sozinha): depois de instalar, toque em «Activar bolha».
            Arraste para mover; toque para abrir o SeCretina. Fica uma
            notificação discreta enquanto estiver activa.
          </Text>
          <Text style={[styles.body, styles.mt]}>
            Estado:{' '}
            {bubbleOn
              ? overlayOk
                ? 'activa'
                : 'activa, mas falta permissão de overlay'
              : 'desligada'}
          </Text>
          <Button
            title={bubbleOn ? 'Desactivar bolha' : 'Activar bolha na tela'}
            onPress={async () => {
              try {
                if (bubbleOn) {
                  await stopSecretinaBubble();
                  setBubbleOn(false);
                  Alert.alert('Bolha', 'Desactivada.');
                  return;
                }
                const result = await enableSecretinaBubble();
                if (result === 'need_permission') {
                  Alert.alert(
                    'Permissão necessária',
                    'Active «Aparecer sobre outros apps» / «Display over other apps» para o SeCretina e volte aqui para activar de novo.'
                  );
                  return;
                }
                setBubbleOn(true);
                setOverlayOk(true);
                Alert.alert(
                  'Bolha activa',
                  'Minimize o app: a bolha «S» continua na tela. Toque nela para falar com a SeCretina.'
                );
              } catch (e) {
                Alert.alert(
                  'Bolha',
                  e instanceof Error ? e.message : 'Não foi possível activar.'
                );
              }
            }}
            style={styles.mt}
          />
          <Button
            title="Abrir permissão de overlay"
            variant="secondary"
            onPress={() => void openOverlayPermissionSettings()}
            style={styles.mt}
          />
        </View>
      ) : null}

      {Platform.OS !== 'web' ? (
        <View style={styles.card}>
          <Text style={styles.title}>Lembretes da agenda</Text>
          <Text style={styles.body}>
            Avisos antes de compromissos: ligações do CRM (APP) e eventos do
            calendário do celular (CELULAR). Informe quantos minutos antes quer
            ser avisado — pode adicionar vários (ex.: 1440 = 1 dia, 60, 15, 5).
          </Text>

          <View style={styles.reminderList}>
            {reminderMinutes.map((m) => (
              <View key={m} style={styles.reminderChip}>
                <Text style={styles.reminderChipText}>
                  {formatMinutesBeforeLabel(m)} ({m} min)
                </Text>
                <Pressable
                  onPress={() => removeReminderOffset(m)}
                  hitSlop={8}
                  style={styles.reminderRemove}
                >
                  <Text style={styles.reminderRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Text style={styles.label}>Adicionar lembrete (minutos)</Text>
          <View style={styles.addReminderRow}>
            <TextInput
              style={[styles.input, styles.addReminderInput]}
              placeholder="Ex.: 30"
              value={newReminderInput}
              onChangeText={setNewReminderInput}
              keyboardType="number-pad"
            />
            <Button
              title="Adicionar"
              variant="secondary"
              onPress={addReminderOffset}
              style={styles.addReminderBtn}
            />
          </View>

          <Pressable
            style={styles.toggleRow}
            onPress={() => setRemindAtTime((v) => !v)}
          >
            <View style={[styles.checkbox, remindAtTime && styles.checkboxOn]}>
              {remindAtTime ? (
                <Text style={styles.checkMark}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.toggleLabel}>Avisar na hora da ligação</Text>
          </Pressable>

          <Button title="Salvar lembretes" onPress={saveReminderSettings} />
          <Button
            title="Aplicar a agendamentos pendentes"
            variant="secondary"
            onPress={applyRemindersToPending}
            style={styles.mt}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>Detecção de chamada</Text>
        <Text style={styles.body}>
          {Platform.OS === 'android'
            ? support.reason ??
              (isListening
                ? 'Ativa: notificação «SeCretina — detecção ativa». Ao terminar a ligação, identifica o contato e abre a nota.'
                : 'Toque em «Ativar detecção». Cadastre o contato com o mesmo número da ligação.')
            : (support.reason ??
              'No iPhone a detecção automática de chamada GSM não está disponível.')}
        </Text>
        {Platform.OS === 'android' ? (
          <>
            <Text style={[styles.body, styles.mt]}>
              Checklist:{'\n'}
              1. Permissão Telefone e Registro de chamadas{'\n'}
              2. Bateria → Sem restrições para o SeCretina{'\n'}
              3. Detecção activa + notificação fixa{'\n'}
              4. Ligação pelo app Telefone — ao desligar, abre a nota
            </Text>
            <Button
              title="Desativar otimização de bateria"
              onPress={async () => {
                try {
                  await requestIgnoreBatteryOptimizations();
                  await checkAll();
                } catch (e) {
                  Alert.alert(
                    'Bateria',
                    e instanceof Error ? e.message : 'Toque em Permitir/OK na janela do Android.'
                  );
                }
              }}
              style={styles.mt}
            />
            <Button
              title="Abrir configurações do SeCretina"
              variant="secondary"
              onPress={() => Linking.openSettings()}
              style={styles.mt}
            />
          </>
        ) : null}
        {lastPhoneEvent ? (
          <Text style={[styles.status, styles.mt]}>
            Último evento detectado: {lastPhoneEvent}
          </Text>
        ) : null}
        {Platform.OS === 'android' ? (
          <Button
            title={isListening ? 'Detecção ativa' : 'Ativar detecção de chamada'}
            variant={isListening ? 'secondary' : 'primary'}
            onPress={async () => {
              const ok = await restartDetection();
              Alert.alert(
                ok ? 'Detecção ativa' : 'Não foi possível ativar',
                ok
                  ? 'Deixe a notificação fixa. Ao desligar, o SeCretina identifica o contato e abre a nota.'
                  : support.reason ??
                      'Verifique permissão Telefone e reinstale o APK se necessário.'
              );
              await checkAll();
            }}
            style={styles.mt}
          />
        ) : null}
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
        SeCretina — CRM de voz · detecção de chamada + notas
      </Text>
    </ScrollView>
  );
}
