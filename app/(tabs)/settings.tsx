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
import { useI18n } from '@/i18n';
import {
  SECRETINA_LANGUAGES,
  getCanSpeakPhrase,
  setSecretinaLanguage,
  type SecretinaLanguage,
} from '@/services/secretinaLanguage';
import { wakeGreetingWord } from '@/services/secretinaSpeak';

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
  const { t, lang, setUiLanguage, refreshLanguage } = useI18n();
  const [bubbleOn, setBubbleOn] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [wakeNameInput, setWakeNameInput] = useState('SeCretina');
  const [voiceGender, setVoiceGenderState] =
    useState<SecretinaVoiceGender>('female');
  const [selectedLang, setSelectedLang] =
    useState<SecretinaLanguage>('pt-BR');
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

  useEffect(() => {
    setSelectedLang(lang);
  }, [lang]);

  const applyLanguage = async (next: SecretinaLanguage) => {
    setSelectedLang(next);
    setUiLanguage(next);
    await setSecretinaLanguage(next);
    await refreshLanguage();
    void prefetchPodeFalar();
    Alert.alert(t('settings.language.title'), t('settings.language.saved'));
  };

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
      const ok = t('settings.perms.ok');
      const denied = t('settings.perms.denied');
      const grantedLabel = t('settings.perms.granted');
      const mapStatus = (s: string) =>
        s === 'granted' ? grantedLabel : s === 'denied' ? denied : s;

      const notif = await ensureNotificationPermissions();
      const phone =
        Platform.OS === 'android' ? await hasPhoneStatePermission() : null;
      const callLog =
        Platform.OS === 'android' ? await hasCallLogPermission() : null;
      const { status: contactsStatus } = await Contacts.getPermissionsAsync();
      let calLine = denied;
      try {
        const cal = await Calendar.getCalendarPermissionsAsync();
        calLine = mapStatus(cal.status);
      } catch {
        calLine = denied;
      }
      setStatus(
        `Notificações / Notifications: ${notif ? ok : denied}\n` +
          (Platform.OS === 'android'
            ? `Telefone / Phone: ${phone ? ok : denied}\n` +
              `Call log: ${callLog ? ok : denied}\n`
            : '') +
          `Detecção / Detection: ${support.supported ? (isListening ? ok : denied) : denied}\n` +
          (Platform.OS === 'android'
            ? `Battery: ${(await isBatteryOptimizationDisabled()) ? ok : denied}\n`
            : '') +
          `${t('tabs.contacts')}: ${mapStatus(contactsStatus)}\n` +
          `${t('tabs.agenda')}: ${calLine}`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t('common.error'));
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
        <Text style={styles.title}>{t('settings.about.title')}</Text>
        <Text style={styles.body}>{t('settings.about.body')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{t('settings.language.title')}</Text>
        <Text style={styles.body}>{t('settings.language.body')}</Text>
        {SECRETINA_LANGUAGES.map((opt) => {
          const on = selectedLang === opt.id;
          return (
            <View key={opt.id} style={styles.toggleRow}>
              <Pressable
                style={[styles.checkbox, on && styles.checkboxOn]}
                onPress={() => void applyLanguage(opt.id)}
              >
                {on ? <Text style={styles.checkMark}>✓</Text> : null}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{opt.label}</Text>
                <Text style={[styles.body, { marginTop: 2 }]}>{opt.hint}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{t('settings.voice.title')}</Text>
        <Text style={styles.body}>{t('settings.voice.body')}</Text>
        <Text style={styles.label}>{t('settings.voice.timbre')}</Text>
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
          <Text style={styles.toggleLabel}>{t('settings.voice.female')}</Text>
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
          <Text style={styles.toggleLabel}>{t('settings.voice.male')}</Text>
        </View>
        <Button
          title={t('settings.voice.test')}
          variant="secondary"
          onPress={async () => {
            try {
              const r = await speakText(await getCanSpeakPhrase());
              if (!r.heard) {
                Alert.alert(
                  t('settings.voice.alertTitle'),
                  t('settings.voice.alertNoPlay')
                );
              }
            } catch (e) {
              Alert.alert(
                t('settings.voice.alertTitle'),
                e instanceof Error ? e.message : t('common.error')
              );
            }
          }}
          style={styles.mt}
        />
      </View>

      {Platform.OS === 'android' ? (
        <View style={styles.card}>
          <Text style={styles.title}>{t('settings.wake.title')}</Text>
          <Text style={styles.body}>
            {t('settings.wake.body', {
              greeting: wakeGreetingWord(lang),
              name: wakeName,
            })}
          </Text>
          <Text style={styles.label}>{t('settings.wake.nameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={wakeNameInput}
            onChangeText={setWakeNameInput}
            placeholder="SeCretina"
            autoCapitalize="words"
          />
          <Button
            title={t('settings.wake.saveName')}
            variant="secondary"
            onPress={async () => {
              await setWakeName(wakeNameInput);
              await refreshWakeName();
              const name = await getWakeName();
              Alert.alert(
                t('settings.wake.title'),
                t('settings.wake.saved', {
                  greeting: wakeGreetingWord(lang),
                  name,
                })
              );
            }}
            style={styles.mt}
          />
          <Text style={[styles.body, styles.mt]}>
            {t('settings.wake.state', {
              state: wakeEnabled
                ? wakeListening
                  ? t('settings.wake.stateListening')
                  : t('settings.wake.stateActive')
                : t('settings.wake.stateOff'),
            })}
          </Text>
          <Button
            title={
              wakeEnabled
                ? t('settings.wake.disable', {
                    greeting: wakeGreetingWord(lang),
                    name: wakeName,
                  })
                : t('settings.wake.enable', {
                    greeting: wakeGreetingWord(lang),
                    name: wakeName,
                  })
            }
            onPress={async () => {
              try {
                await setWakeEnabled(!wakeEnabled);
                Alert.alert(
                  t('settings.wake.title'),
                  !wakeEnabled
                    ? t('settings.wake.enabledAlert', {
                        greeting: wakeGreetingWord(lang),
                        name: wakeName,
                      })
                    : t('settings.wake.disabledAlert')
                );
              } catch (e) {
                Alert.alert(
                  t('common.error'),
                  e instanceof Error ? e.message : t('common.error')
                );
              }
            }}
            style={styles.mt}
          />
          <Button
            title={t('settings.wake.openAssistant')}
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
          <Text style={styles.title}>{t('settings.bubble.title')}</Text>
          <Text style={styles.body}>{t('settings.bubble.body')}</Text>
          <Text style={[styles.body, styles.mt]}>
            {t('settings.wake.state', {
              state: bubbleOn
                ? overlayOk
                  ? t('settings.bubble.stateOn')
                  : t('settings.bubble.stateNeedOverlay')
                : t('settings.bubble.stateOff'),
            })}
          </Text>
          <Button
            title={
              bubbleOn
                ? t('settings.bubble.disable')
                : t('settings.bubble.enable')
            }
            onPress={async () => {
              try {
                if (bubbleOn) {
                  await stopSecretinaBubble();
                  setBubbleOn(false);
                  return;
                }
                const result = await enableSecretinaBubble();
                if (result === 'need_permission') {
                  Alert.alert(
                    t('settings.bubble.title'),
                    t('settings.bubble.openOverlay')
                  );
                  return;
                }
                setBubbleOn(true);
                setOverlayOk(true);
              } catch (e) {
                Alert.alert(
                  t('settings.bubble.title'),
                  e instanceof Error ? e.message : t('common.error')
                );
              }
            }}
            style={styles.mt}
          />
          <Button
            title={t('settings.bubble.openOverlay')}
            variant="secondary"
            onPress={() => void openOverlayPermissionSettings()}
            style={styles.mt}
          />
        </View>
      ) : null}

      {Platform.OS !== 'web' ? (
        <View style={styles.card}>
          <Text style={styles.title}>{t('settings.reminders.title')}</Text>
          <Text style={styles.body}>{t('settings.reminders.body')}</Text>

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

          <Text style={styles.label}>{t('settings.reminders.addLabel')}</Text>
          <View style={styles.addReminderRow}>
            <TextInput
              style={[styles.input, styles.addReminderInput]}
              placeholder={t('settings.reminders.addPlaceholder')}
              value={newReminderInput}
              onChangeText={setNewReminderInput}
              keyboardType="number-pad"
            />
            <Button
              title={t('settings.reminders.add')}
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
            <Text style={styles.toggleLabel}>
              {t('settings.reminders.atCall')}
            </Text>
          </Pressable>

          <Button
            title={t('settings.reminders.save')}
            onPress={saveReminderSettings}
          />
          <Button
            title={t('settings.reminders.apply')}
            variant="secondary"
            onPress={applyRemindersToPending}
            style={styles.mt}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>{t('settings.detection.title')}</Text>
        <Text style={styles.body}>
          {Platform.OS === 'android'
            ? support.reason ??
              (isListening
                ? t('settings.detection.active')
                : t('settings.detection.activate'))
            : (support.reason ?? t('settings.detection.title'))}
        </Text>
        {Platform.OS === 'android' ? (
          <>
            <Text style={[styles.body, styles.mt]}>
              {t('settings.detection.checklist')}
            </Text>
            <Button
              title={t('settings.detection.battery')}
              onPress={async () => {
                try {
                  await requestIgnoreBatteryOptimizations();
                  await checkAll();
                } catch (e) {
                  Alert.alert(
                    t('settings.detection.battery'),
                    e instanceof Error ? e.message : t('common.error')
                  );
                }
              }}
              style={styles.mt}
            />
            <Button
              title={t('settings.detection.openSettings')}
              variant="secondary"
              onPress={() => Linking.openSettings()}
              style={styles.mt}
            />
          </>
        ) : null}
        {lastPhoneEvent ? (
          <Text style={[styles.status, styles.mt]}>
            {lastPhoneEvent}
          </Text>
        ) : null}
        {Platform.OS === 'android' ? (
          <Button
            title={
              isListening
                ? t('settings.detection.active')
                : t('settings.detection.activate')
            }
            variant={isListening ? 'secondary' : 'primary'}
            onPress={async () => {
              const ok = await restartDetection();
              Alert.alert(
                ok
                  ? t('settings.detection.active')
                  : t('common.error'),
                ok
                  ? t('settings.detection.active')
                  : support.reason ?? t('common.error')
              );
              await checkAll();
            }}
            style={styles.mt}
          />
        ) : null}
      </View>

      <Button title={t('settings.perms.request')} onPress={requestAll} />
      <Button
        title={t('settings.perms.status')}
        variant="secondary"
        onPress={checkAll}
        style={styles.mt}
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <Text style={styles.footer}>{t('settings.footer')}</Text>
    </ScrollView>
  );
}
