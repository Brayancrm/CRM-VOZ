import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  Platform,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { DictateNoteButton } from '@/components/DictateNoteButton';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { speakText, stopSpeaking } from '@/services/speech';
import {
  runSecretinaVoiceCommand,
  updateScheduledCallNote,
  type AssistantResult,
} from '@/services/secretinaAssistant';
import { showAppAlert } from '@/utils/alert';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';
import {
  abortSpeechRecognition,
  prepareMicForRecognition,
  startCommandRecognition,
} from '@/services/speechDictate';
import { formatPhoneDisplay } from '@/utils/phone';
import { matchContactBySpokenName } from '@/utils/secretinaCommand';
import { normalizeSpoken } from '@/utils/normalizeSpoken';
import { parseSpokenChoiceIndex } from '@/utils/contactChoice';
import { isSpokenNo, isSpokenYes } from '@/utils/spokenYesNo';
import {
  askScheduleNotePhrase,
  getCanSpeakPhrase,
  getSecretinaLanguage,
  yesNoHint,
} from '@/services/secretinaLanguage';
import {
  msgByeAfterSchedule,
  msgMicStartFail,
  msgNoSpeechHeard,
  msgPickNotUnderstood,
  msgProcessFailSpeak,
  msgRepeatContactName,
  msgScheduleMissingForNote,
  msgScheduleNoteSaved,
  unnamedContact,
} from '@/services/secretinaSpeak';
import { formatDateTime } from '@/utils/date';
import type { Contact } from '@/types';
import { useI18n } from '@/i18n';

type Phase = 'idle' | 'speaking' | 'listening' | 'processing' | 'done' | 'error';
type ListenMode =
  | 'command'
  | 'pick_contact'
  | 'ask_schedule_note'
  | 'dictate_schedule_note';

/** Silêncio antes de considerar o comando completo (pausas naturais). */
const COMMAND_SILENCE_MS = 3800;
/** Na escolha de contacto, espera um pouco mais pela resposta. */
const PICK_SILENCE_MS = 4500;
/** Sim/não — resposta curta. */
const YES_NO_SILENCE_MS = 2800;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SecretinaAssistantModal({ visible, onClose }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const { height: windowHeight } = useWindowDimensions();
  const {
    setMicBusy,
    autoListenOnOpen,
    greetFirstOnOpen,
    clearAutoListen,
    wakeName,
  } = useSecretinaAssistant();
  const [phase, setPhase] = useState<Phase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [typedFallback, setTypedFallback] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [ambiguous, setAmbiguous] = useState<Contact[]>([]);
  const [pendingText, setPendingText] = useState('');
  const [scheduleNotePreview, setScheduleNotePreview] = useState('');
  const phaseRef = useRef<Phase>('idle');
  const processingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const liveTranscriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const listenModeRef = useRef<ListenMode>('command');
  const ambiguousRef = useRef<Contact[]>([]);
  const pendingTextRef = useRef('');
  const speakingLockRef = useRef(false);
  const resultRef = useRef<AssistantResult | null>(null);
  /** Incrementa em cada reset/início — anula TTS/processamento antigo. */
  const sessionGenRef = useRef(0);

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  /** Fala e só resolve no fim — mic nunca a meio do TTS. Nunca trava >18s. */
  const speakThen = useCallback(async (text: string): Promise<boolean> => {
    const gen = sessionGenRef.current;
    speakingLockRef.current = true;
    abortSpeechRecognition();
    setPhaseSafe('speaking');
    setLiveTranscript(text);
    try {
      const heard = await Promise.race([
        speakText(text).then((r) => r.heard),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 18_000);
        }),
      ]);
      if (gen !== sessionGenRef.current) return false;
      if (!heard) {
        // Segunda tentativa rápida (rede / motor de voz)
        await new Promise((r) => setTimeout(r, 300));
        if (gen !== sessionGenRef.current) return false;
        const again = await Promise.race([
          speakText(text).then((r) => r.heard),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 12_000);
          }),
        ]);
        return gen === sessionGenRef.current ? again : false;
      }
      return true;
    } catch (e) {
      console.warn('SeCretina TTS', e);
      return false;
    } finally {
      if (gen === sessionGenRef.current) {
        speakingLockRef.current = false;
      }
    }
  }, [setPhaseSafe]);

  const unlockSession = useCallback(async () => {
    sessionGenRef.current += 1;
    speakingLockRef.current = false;
    processingRef.current = false;
    clearSilenceTimer();
    abortSpeechRecognition();
    try {
      await stopSpeaking();
    } catch {
      /* ignore */
    }
  }, []);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: c.surface,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '92%',
        paddingBottom: 8,
      },
      sheetScroll: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 24,
        gap: 12,
      },
      title: { fontSize: 20, fontWeight: '700', color: c.text },
      subtitle: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
      listening: {
        fontSize: 16,
        fontWeight: '600',
        color: c.primary,
        minHeight: 48,
      },
      label: { fontSize: 13, fontWeight: '600', color: c.textMuted },
      input: {
        minHeight: 72,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 12,
        color: c.text,
        backgroundColor: c.bg,
        textAlignVertical: 'top',
      },
      success: {
        fontSize: 15,
        color: c.primary,
        fontWeight: '600',
        lineHeight: 22,
      },
      error: { fontSize: 14, color: c.danger, lineHeight: 20 },
      notePreview: {
        fontSize: 14,
        color: c.text,
        lineHeight: 20,
        backgroundColor: c.bg,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: c.border,
      },
      pickList: {
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        backgroundColor: c.bg,
        overflow: 'hidden',
      },
      pickRow: {
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
      },
      pickText: { fontSize: 16, fontWeight: '600', color: c.text },
      pickHint: { fontSize: 13, color: c.textMuted, marginTop: 4 },
    })
  );

  const reset = useCallback(() => {
    void unlockSession();
    autoStartedRef.current = false;
    liveTranscriptRef.current = '';
    listenModeRef.current = 'command';
    ambiguousRef.current = [];
    pendingTextRef.current = '';
    resultRef.current = null;
    setMicBusy(false);
    setPhaseSafe('idle');
    setLiveTranscript('');
    setTypedFallback('');
    setResult(null);
    setErrorMsg('');
    setAmbiguous([]);
    setPendingText('');
    setScheduleNotePreview('');
  }, [setPhaseSafe, setMicBusy, unlockSession]);

  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible, reset]);

  const openMicForMode = useCallback(
    async (mode: ListenMode) => {
      if (speakingLockRef.current) return;
      listenModeRef.current = mode;
      abortSpeechRecognition();
      setMicBusy(true);
      setPhaseSafe('listening');
      const lang = await getSecretinaLanguage();
      const hint =
        mode === 'pick_contact'
          ? t('assistant.listening.pick')
          : mode === 'ask_schedule_note'
            ? yesNoHint(lang)
            : mode === 'dictate_schedule_note'
              ? t('assistant.listening.dictate')
              : t('assistant.listening.command');
      setLiveTranscript(hint);
      liveTranscriptRef.current = '';
      await prepareMicForRecognition();
      await new Promise((r) => setTimeout(r, 300));
      if (phaseRef.current !== 'listening' || speakingLockRef.current) return;
      startedAtRef.current = Date.now();
      try {
        await startCommandRecognition({
          longUtterance:
            mode === 'command' || mode === 'dictate_schedule_note',
        });
      } catch (e) {
        setMicBusy(false);
        setPhaseSafe('error');
        setErrorMsg(
          e instanceof Error ? e.message : msgMicStartFail(await getSecretinaLanguage())
        );
      }
    },
    [setMicBusy, setPhaseSafe, t]
  );

  const applyOutcome = useCallback(
    async (outcome: AssistantResult) => {
      const gen = sessionGenRef.current;
      setResult(outcome);
      resultRef.current = outcome;
      if (outcome.ok) {
        setAmbiguous([]);
        ambiguousRef.current = [];
        setPendingText('');
        pendingTextRef.current = '';
        listenModeRef.current = 'command';
        setMicBusy(false);

        const shouldAskNote =
          outcome.kind === 'schedule' && Boolean(outcome.scheduledId);

        if (shouldAskNote) {
          const withAsk = { ...outcome, askScheduleNote: true };
          setResult(withAsk);
          resultRef.current = withAsk;
          setPhaseSafe('done');
          await speakThen(outcome.message);
          if (gen !== sessionGenRef.current) return;
          const lang = await getSecretinaLanguage();
          await speakThen(askScheduleNotePhrase(lang));
          if (gen !== sessionGenRef.current) return;
          await new Promise((r) => setTimeout(r, 400));
          if (gen !== sessionGenRef.current) return;
          await openMicForMode('ask_schedule_note');
          return;
        }

        setPhaseSafe('done');
        await speakThen(outcome.message);
        if (gen !== sessionGenRef.current) return;
        setPhaseSafe('done');
        setMicBusy(false);
        return;
      }

      if (outcome.ambiguous && outcome.ambiguous.length > 0) {
        setAmbiguous(outcome.ambiguous);
        ambiguousRef.current = outcome.ambiguous;
        const pending = outcome.pendingText ?? outcome.spokenText;
        setPendingText(pending);
        pendingTextRef.current = pending;
        setErrorMsg(outcome.message);
        setPhaseSafe('error');
        const toSpeak =
          outcome.speakMessage?.trim() ||
          outcome.message.split('\n')[0] ||
          outcome.message;
        await speakThen(toSpeak);
        if (gen !== sessionGenRef.current) return;
        await openMicForMode('pick_contact');
        return;
      }

      // Erro recuperável (sem nome, sem data, etc.): fala e reabre o mic
      setAmbiguous([]);
      ambiguousRef.current = [];
      setPendingText('');
      pendingTextRef.current = '';
      listenModeRef.current = 'command';
      setPhaseSafe('error');
      setErrorMsg(outcome.message);
      await speakThen(outcome.message);
      if (gen !== sessionGenRef.current) return;
      await new Promise((r) => setTimeout(r, 350));
      if (gen !== sessionGenRef.current) return;
      await openMicForMode('command');
    },
    [setPhaseSafe, setMicBusy, speakThen, openMicForMode]
  );

  const resolvePickContact = useCallback(
    (spoken: string): Contact | null => {
      const candidates = ambiguousRef.current;
      if (!candidates.length) return null;

      // «2», «número dois», «opção 3»…
      const byNumber = parseSpokenChoiceIndex(spoken, candidates.length);
      if (byNumber != null) {
        return candidates[byNumber - 1] ?? null;
      }

      const match = matchContactBySpokenName(spoken, candidates);
      if (match.status === 'found' && match.contact) {
        return (
          candidates.find((c) => c.id === match.contact!.id) ?? null
        );
      }
      const n = normalizeSpoken(spoken);
      const hits = candidates.filter((c) => {
        const name = normalizeSpoken(c.name);
        return (
          name.includes(n) ||
          n.split(/\s+/).every((t) => t.length > 1 && name.includes(t))
        );
      });
      if (hits.length === 1) return hits[0];
      return null;
    },
    []
  );

  const processCommand = useCallback(
    async (text: string, contactId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || processingRef.current) return;
      if (speakingLockRef.current) return;

      // Sim/não após agendamento
      if (listenModeRef.current === 'ask_schedule_note' && !contactId) {
        processingRef.current = true;
        clearSilenceTimer();
        abortSpeechRecognition();
        setLiveTranscript(trimmed);
        liveTranscriptRef.current = trimmed;
        try {
          if (isSpokenYes(trimmed, await getSecretinaLanguage())) {
            const greet = await getCanSpeakPhrase();
            setPhaseSafe('speaking');
            setLiveTranscript(greet);
            const heard = await speakThen(greet);
            if (!heard) {
              setMicBusy(false);
              setPhaseSafe('error');
              setErrorMsg(msgMicStartFail(await getSecretinaLanguage()));
              return;
            }
            await new Promise((r) => setTimeout(r, 500));
            await openMicForMode('dictate_schedule_note');
            return;
          }
          if (isSpokenNo(trimmed, await getSecretinaLanguage())) {
            const lang = await getSecretinaLanguage();
            const r = resultRef.current;
            const when =
              r?.ok && r.scheduledAt != null
                ? formatDateTime(r.scheduledAt, lang)
                : '';
            const name =
              r?.ok && r.contact?.name
                ? r.contact.name
                : unnamedContact(lang);
            const bye = msgByeAfterSchedule(lang, name, when);
            setMicBusy(false);
            setPhaseSafe('done');
            listenModeRef.current = 'command';
            await speakThen(bye);
            setPhaseSafe('done');
            return;
          }
          await speakThen(yesNoHint(await getSecretinaLanguage()));
          await openMicForMode('ask_schedule_note');
        } finally {
          processingRef.current = false;
        }
        return;
      }

      // Ditado da nota do agendamento
      if (listenModeRef.current === 'dictate_schedule_note' && !contactId) {
        processingRef.current = true;
        clearSilenceTimer();
        abortSpeechRecognition();
        setPhaseSafe('processing');
        setLiveTranscript(trimmed);
        liveTranscriptRef.current = trimmed;
        try {
          const current = resultRef.current;
          const scheduledId =
            current?.ok && current.kind === 'schedule'
              ? current.scheduledId
              : undefined;
          if (!scheduledId) {
            const lang = await getSecretinaLanguage();
            setMicBusy(false);
            setPhaseSafe('error');
            setErrorMsg(msgScheduleMissingForNote(lang));
            await speakThen(msgScheduleMissingForNote(lang));
            return;
          }
          const saved = await updateScheduledCallNote(scheduledId, trimmed);
          if (!saved.ok) {
            setMicBusy(false);
            setPhaseSafe('error');
            setErrorMsg(saved.message);
            await speakThen(saved.message);
            return;
          }
          setScheduleNotePreview(trimmed);
          const next =
            current?.ok
              ? { ...current, askScheduleNote: false, noteBody: trimmed }
              : current;
          setResult(next);
          resultRef.current = next;
          setMicBusy(false);
          listenModeRef.current = 'command';
          setPhaseSafe('done');
          await speakThen(msgScheduleNoteSaved(await getSecretinaLanguage()));
          setPhaseSafe('done');
        } finally {
          processingRef.current = false;
        }
        return;
      }

      if (
        !contactId &&
        listenModeRef.current === 'command' &&
        (phaseRef.current === 'processing' || phaseRef.current === 'done')
      ) {
        return;
      }

      // Modo escolha de contacto por voz
      if (listenModeRef.current === 'pick_contact' && !contactId) {
        const picked = resolvePickContact(trimmed);
        if (!picked) {
          clearSilenceTimer();
          liveTranscriptRef.current = '';
          await speakThen(msgPickNotUnderstood(await getSecretinaLanguage()));
          await openMicForMode('pick_contact');
          return;
        }
        contactId = picked.id;
        listenModeRef.current = 'command';
      }

      processingRef.current = true;
      clearSilenceTimer();
      abortSpeechRecognition();
      setPhaseSafe('processing');
      setLiveTranscript(trimmed);
      liveTranscriptRef.current = trimmed;
      if (!contactId) {
        setAmbiguous([]);
        ambiguousRef.current = [];
      }

      try {
        const commandText =
          contactId && pendingTextRef.current.trim()
            ? pendingTextRef.current.trim()
            : trimmed;
        const outcome = await runSecretinaVoiceCommand(
          commandText,
          contactId ? { contactId } : undefined
        );
        await applyOutcome(outcome);
      } catch (e) {
        console.warn('SeCretina processCommand', e);
        speakingLockRef.current = false;
        setMicBusy(false);
        setPhaseSafe('error');
        setErrorMsg(
          e instanceof Error
            ? e.message
            : msgProcessFailSpeak(await getSecretinaLanguage())
        );
        try {
          await speakThen(msgProcessFailSpeak(await getSecretinaLanguage()));
          await openMicForMode('command');
        } catch {
          setMicBusy(false);
        }
      } finally {
        processingRef.current = false;
      }
    },
    [
      setPhaseSafe,
      applyOutcome,
      resolvePickContact,
      speakThen,
      openMicForMode,
      setMicBusy,
    ]
  );

  const pickContact = (contact: Contact) => {
    const text = pendingTextRef.current.trim() || pendingText.trim() || typedFallback.trim();
    if (!text) return;
    listenModeRef.current = 'command';
    void processCommand(text, contact.id);
  };

  const scheduleProcessAfterSilence = useCallback(
    (text: string) => {
      clearSilenceTimer();
      if (!text.trim()) return;
      const delay =
        listenModeRef.current === 'pick_contact'
          ? PICK_SILENCE_MS
          : listenModeRef.current === 'ask_schedule_note'
            ? YES_NO_SILENCE_MS
            : COMMAND_SILENCE_MS;
      silenceTimerRef.current = setTimeout(() => {
        if (
          phaseRef.current === 'listening' &&
          !speakingLockRef.current &&
          liveTranscriptRef.current.trim()
        ) {
          void processCommand(liveTranscriptRef.current);
        }
      }, delay);
    },
    [processCommand]
  );

  useSpeechRecognitionEvent('result', (event) => {
    if (speakingLockRef.current) return;
    if (phaseRef.current !== 'listening') return;
    const text = event.results?.[0]?.transcript ?? '';
    if (!text.trim()) return;

    liveTranscriptRef.current = text;
    setLiveTranscript(text);
    setTypedFallback(text);

    // Não processar em isFinal — no Android corta frases longas.
    // Só o timer de silêncio decide quando o utilizador terminou.
    scheduleProcessAfterSilence(text);
  });

  useSpeechRecognitionEvent('end', () => {
    if (speakingLockRef.current) return;
    if (phaseRef.current !== 'listening') return;
    // Em modo contínuo o "end" pode ser prematuro — espera o silêncio.
    // Se já há texto, só agenda o timer (não processa já).
    const text = liveTranscriptRef.current.trim();
    if (text) {
      scheduleProcessAfterSilence(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (speakingLockRef.current) return;
    if (phaseRef.current !== 'listening') return;
    if (event.error === 'aborted') return;

    const partial = liveTranscriptRef.current.trim();
    if (
      partial &&
      (event.error === 'no-speech' || event.error === 'speech-timeout')
    ) {
      // Ainda pode estar a pensar — dá uma última hipótese via silêncio
      scheduleProcessAfterSilence(partial);
      return;
    }

    if (listenModeRef.current === 'pick_contact') {
      // Mantém lista aberta e tenta ouvir de novo
      void (async () => {
        await speakThen(msgRepeatContactName(await getSecretinaLanguage()));
        await openMicForMode('pick_contact');
      })();
      return;
    }

    if (listenModeRef.current === 'ask_schedule_note') {
      void (async () => {
        await speakThen(yesNoHint(await getSecretinaLanguage()));
        await openMicForMode('ask_schedule_note');
      })();
      return;
    }

    if (listenModeRef.current === 'dictate_schedule_note') {
      void (async () => {
        await speakThen(await getCanSpeakPhrase());
        await openMicForMode('dictate_schedule_note');
      })();
      return;
    }

    clearSilenceTimer();
    setMicBusy(false);
    setPhaseSafe('error');
    void (async () => {
      const lang = await getSecretinaLanguage();
      setErrorMsg(
        event.error === 'no-speech' || event.error === 'speech-timeout'
          ? msgNoSpeechHeard(lang)
          : event.message || msgMicStartFail(lang)
      );
    })();
  });

  const startListening = async (opts?: {
    skipGreet?: boolean;
    greetFirst?: boolean;
  }) => {
    if (Platform.OS === 'web') {
      showAppAlert(t('assistant.webOnly.title'), t('assistant.webOnly.body'));
      return;
    }

    // Liberta qualquer TTS/mic/processamento preso de tentativas anteriores
    await unlockSession();
    setResult(null);
    resultRef.current = null;
    setErrorMsg('');
    setAmbiguous([]);
    ambiguousRef.current = [];
    setPendingText('');
    pendingTextRef.current = '';
    setScheduleNotePreview('');
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    listenModeRef.current = 'command';

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setMicBusy(false);
      setPhaseSafe('error');
      setErrorMsg(msgMicStartFail(await getSecretinaLanguage()));
      return;
    }

    setMicBusy(true);

    const shouldGreet = Boolean(opts?.greetFirst) && !opts?.skipGreet;
    if (shouldGreet) {
      setPhaseSafe('speaking');
      const greet = await getCanSpeakPhrase();
      setLiveTranscript(greet);
      const heard = await speakThen(greet);
      if (!heard) {
        // Fallback: abre o mic na mesma — não deixa o assistente morto
        setLiveTranscript('…');
        await new Promise((r) => setTimeout(r, 300));
        await openMicForMode('command');
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    await openMicForMode('command');
  };

  useEffect(() => {
    if (!visible || !autoListenOnOpen || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const greet = greetFirstOnOpen;
    // clearAutoListen SÓ depois do timeout — senão o effect cancela o timer
    // (autoListenOnOpen=false → cleanup → clearTimeout) e o mic nunca abre.
    const t = setTimeout(() => {
      clearAutoListen();
      void startListening({ greetFirst: greet, skipGreet: !greet });
    }, greet ? 500 : 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoListenOnOpen]);

  const stopListening = () => {
    clearSilenceTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    const text = liveTranscriptRef.current.trim();
    if (text) {
      void processCommand(text);
    } else {
      setMicBusy(false);
      setPhaseSafe('error');
      void getSecretinaLanguage().then((lang) => {
        setErrorMsg(msgNoSpeechHeard(lang));
      });
    }
  };

  const submitTyped = () => {
    const text = typedFallback.trim();
    if (!text) return;
    void processCommand(text);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onScheduleNoteDictated = async (text: string) => {
    if (!result?.ok || result.kind !== 'schedule' || !result.scheduledId) return;
    const saved = await updateScheduledCallNote(result.scheduledId, text);
    if (!saved.ok) {
      showAppAlert('Nota', saved.message);
      return;
    }
    setScheduleNotePreview(text.trim());
    const next = {
      ...result,
      askScheduleNote: false,
      noteBody: text.trim(),
    };
    setResult(next);
    resultRef.current = next;
    void (async () => {
      await speakText(msgScheduleNoteSaved(await getSecretinaLanguage()));
    })();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheet, { maxHeight: windowHeight * 0.92 }]}>
          <ScrollView
            style={{ maxHeight: windowHeight * 0.92 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.sheetScroll}
          >
            <Text style={styles.title}>{t('assistant.title')}</Text>
            {ambiguous.length === 0 ? (
              <Text style={styles.subtitle}>
                {t('assistant.subtitle', { name: wakeName })}
              </Text>
            ) : null}

            {phase === 'speaking' ? (
              <Text style={styles.listening}>
                {liveTranscript || t('assistant.phase.speaking')}
              </Text>
            ) : null}

            {phase === 'listening' ? (
              <Text style={styles.listening}>
                {liveTranscript.trim()
                  ? liveTranscript
                  : listenModeRef.current === 'pick_contact'
                    ? t('assistant.listening.pick')
                    : listenModeRef.current === 'ask_schedule_note'
                      ? t('assistant.listening.yesNo')
                      : listenModeRef.current === 'dictate_schedule_note'
                        ? t('assistant.listening.dictate')
                        : t('assistant.listening.command')}
              </Text>
            ) : null}

            {phase === 'processing' ? (
              <Text style={styles.listening}>{t('assistant.phase.processing')}</Text>
            ) : null}

            {phase === 'done' && result?.ok ? (
              <>
                <Text style={styles.success}>{result.message}</Text>
                {(result.kind === 'note' || result.kind === 'mixed') &&
                result.noteBody ? (
                  <>
                    <Text style={styles.label}>{t('assistant.label.note')}</Text>
                    <Text style={styles.notePreview}>{result.noteBody}</Text>
                  </>
                ) : null}
                {result.kind === 'list' && result.agendaItems?.length ? (
                  <View style={styles.pickList}>
                    {result.agendaItems.slice(0, 8).map((item, i) => (
                      <View key={item.id} style={styles.pickRow}>
                        <Text style={styles.pickText}>
                          {i + 1}. {item.contactName}
                        </Text>
                        <Text style={styles.pickHint}>
                          {formatDateTime(item.scheduledAt)}
                          {item.note ? ` · ${item.note}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {result.kind === 'schedule' || result.kind === 'mixed' ? (
                  <>
                    <Text style={styles.notePreview}>
                      {t('assistant.savedInAgenda')}
                    </Text>
                    {result.kind === 'schedule' && scheduleNotePreview ? (
                      <>
                        <Text style={styles.label}>
                          {t('assistant.label.scheduleNote')}
                        </Text>
                        <Text style={styles.notePreview}>
                          {scheduleNotePreview}
                        </Text>
                      </>
                    ) : result.kind === 'schedule' ? (
                      <>
                        <Text style={styles.label}>
                          {t('assistant.label.askScheduleNote')}
                        </Text>
                        {listenModeRef.current === 'ask_schedule_note' ? (
                          <Text style={styles.listening}>
                            {t('assistant.listening.yesNo')}
                          </Text>
                        ) : null}
                        <DictateNoteButton
                          title={t('assistant.cta.dictateNote')}
                          onTranscript={(tx) => void onScheduleNoteDictated(tx)}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                {result.kind === 'list' ||
                result.kind === 'schedule' ||
                result.kind === 'mixed' ||
                result.kind === 'cancel' ||
                result.kind === 'reschedule' ? (
                  <Button
                    title={t('assistant.cta.viewAgenda')}
                    onPress={() => {
                      handleClose();
                      router.push('/(tabs)/agenda');
                    }}
                  />
                ) : result.contact?.id ? (
                  <Button
                    title={t('assistant.cta.openContact', {
                      name: result.contact.name,
                    })}
                    onPress={() => {
                      handleClose();
                      router.push(`/contact/${result.contact!.id}`);
                    }}
                  />
                ) : null}
              </>
            ) : null}

            {phase === 'error' && errorMsg ? (
              <Text style={styles.error}>{errorMsg}</Text>
            ) : null}

            {ambiguous.length > 0 ? (
              <>
                <Text style={styles.label}>
                  {t('assistant.label.pickContact')}
                </Text>
                <View style={styles.pickList}>
                  {ambiguous.map((c, i) => (
                    <Pressable
                      key={c.id}
                      style={styles.pickRow}
                      onPress={() => pickContact(c)}
                    >
                      <Text style={styles.pickText}>
                        {i + 1}. {c.name?.trim() || t('assistant.unnamed')}
                      </Text>
                      {c.phone_normalized ? (
                        <Text style={styles.pickHint}>
                          {formatPhoneDisplay(c.phone_normalized)}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {phase === 'listening' ? (
              <Button
                title={t('assistant.cta.stop')}
                onPress={stopListening}
              />
            ) : (
              <Button
                title={
                  phase === 'idle' || phase === 'error' || phase === 'done'
                    ? t('assistant.cta.speakNow')
                    : t('assistant.cta.wait')
                }
                onPress={() => void startListening({ skipGreet: true })}
                disabled={
                  phase === 'processing' || phase === 'speaking'
                }
              />
            )}

            {ambiguous.length === 0 ? (
              <>
                <Text style={styles.label}>{t('assistant.label.typed')}</Text>
                <TextInput
                  style={styles.input}
                  multiline
                  placeholder={t('assistant.placeholder.command')}
                  value={typedFallback}
                  onChangeText={setTypedFallback}
                  editable={phase !== 'processing'}
                />
                <Button
                  title={t('assistant.cta.runText')}
                  variant="secondary"
                  onPress={submitTyped}
                  disabled={!typedFallback.trim() || phase === 'processing'}
                />
              </>
            ) : null}

            <Button
              title={t('assistant.cta.close')}
              variant="ghost"
              onPress={handleClose}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
