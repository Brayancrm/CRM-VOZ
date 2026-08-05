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
import type { Contact } from '@/types';

type Phase = 'idle' | 'speaking' | 'listening' | 'processing' | 'done' | 'error';
type ListenMode = 'command' | 'pick_contact';

/** Silêncio antes de considerar o comando completo (pausas naturais). */
const COMMAND_SILENCE_MS = 3800;
/** Na escolha de contacto, espera um pouco mais pela resposta. */
const PICK_SILENCE_MS = 4500;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SecretinaAssistantModal({ visible, onClose }: Props) {
  const router = useRouter();
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

  /** Fala e só resolve no fim — mic nunca a meio do TTS. */
  const speakThen = useCallback(async (text: string): Promise<boolean> => {
    speakingLockRef.current = true;
    abortSpeechRecognition();
    setPhaseSafe('speaking');
    setLiveTranscript(text);
    try {
      let result = await speakText(text);
      if (!result.heard) {
        // Segunda tentativa (rede / motor de voz)
        await new Promise((r) => setTimeout(r, 400));
        result = await speakText(text);
      }
      return result.heard;
    } catch (e) {
      console.warn('SeCretina TTS', e);
      return false;
    } finally {
      speakingLockRef.current = false;
    }
  }, [setPhaseSafe]);

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
    clearSilenceTimer();
    void stopSpeaking();
    processingRef.current = false;
    autoStartedRef.current = false;
    liveTranscriptRef.current = '';
    listenModeRef.current = 'command';
    ambiguousRef.current = [];
    pendingTextRef.current = '';
    speakingLockRef.current = false;
    abortSpeechRecognition();
    setMicBusy(false);
    setPhaseSafe('idle');
    setLiveTranscript('');
    setTypedFallback('');
    setResult(null);
    setErrorMsg('');
    setAmbiguous([]);
    setPendingText('');
    setScheduleNotePreview('');
  }, [setPhaseSafe, setMicBusy]);

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
      setLiveTranscript(
        mode === 'pick_contact'
          ? 'Pode dizer o contacto…'
          : 'Microfone activo — fale agora'
      );
      liveTranscriptRef.current = '';
      await prepareMicForRecognition();
      await new Promise((r) => setTimeout(r, 300));
      if (phaseRef.current !== 'listening' || speakingLockRef.current) return;
      startedAtRef.current = Date.now();
      try {
        startCommandRecognition({ longUtterance: true });
      } catch (e) {
        setMicBusy(false);
        setPhaseSafe('error');
        setErrorMsg(
          e instanceof Error ? e.message : 'Não foi possível iniciar a voz.'
        );
      }
    },
    [setMicBusy, setPhaseSafe]
  );

  const applyOutcome = useCallback(
    async (outcome: AssistantResult) => {
      setResult(outcome);
      if (outcome.ok) {
        setAmbiguous([]);
        ambiguousRef.current = [];
        setPendingText('');
        pendingTextRef.current = '';
        listenModeRef.current = 'command';
        setMicBusy(false);
        setPhaseSafe('done');
        await speakThen(outcome.message);
        setPhaseSafe('done');
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
        await openMicForMode('pick_contact');
        return;
      }

      setAmbiguous([]);
      ambiguousRef.current = [];
      setPendingText('');
      pendingTextRef.current = '';
      listenModeRef.current = 'command';
      setMicBusy(false);
      setPhaseSafe('error');
      setErrorMsg(outcome.message);
      await speakThen(outcome.message);
      setPhaseSafe('error');
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
          await speakThen(
            'Não entendi. Diga o número da lista, por exemplo 1 ou 2, ou o sobrenome.'
          );
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

      const commandText =
        contactId && pendingTextRef.current.trim()
          ? pendingTextRef.current.trim()
          : trimmed;
      const outcome = await runSecretinaVoiceCommand(
        commandText,
        contactId ? { contactId } : undefined
      );
      await applyOutcome(outcome);
      processingRef.current = false;
    },
    [
      setPhaseSafe,
      applyOutcome,
      resolvePickContact,
      speakThen,
      openMicForMode,
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
        await speakThen('Pode repetir o nome do contacto?');
        await openMicForMode('pick_contact');
      })();
      return;
    }

    clearSilenceTimer();
    setMicBusy(false);
    setPhaseSafe('error');
    setErrorMsg(
      event.error === 'no-speech' || event.error === 'speech-timeout'
        ? 'Não ouvi nada. Toque em Falar de novo, fale perto do telemóvel, ou digite o comando.'
        : event.message || 'Erro no reconhecimento de voz.'
    );
  });

  const startListening = async (opts?: {
    skipGreet?: boolean;
    greetFirst?: boolean;
  }) => {
    if (Platform.OS === 'web') {
      showAppAlert(
        'Só no celular',
        'O reconhecimento de voz do SeCretina funciona no app Android.'
      );
      return;
    }

    clearSilenceTimer();
    setResult(null);
    setErrorMsg('');
    setAmbiguous([]);
    ambiguousRef.current = [];
    setPendingText('');
    pendingTextRef.current = '';
    setScheduleNotePreview('');
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    listenModeRef.current = 'command';
    // Não chamar stopSpeaking aqui de forma agressiva antes do greet —
    // só abortar o reconhecimento do wake.
    abortSpeechRecognition();

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setPhaseSafe('error');
      setErrorMsg(
        'Permita microfone e reconhecimento de voz nas definições do SeCretina.'
      );
      return;
    }

    setMicBusy(true);

    const shouldGreet = Boolean(opts?.greetFirst) && !opts?.skipGreet;
    if (shouldGreet) {
      setPhaseSafe('speaking');
      setLiveTranscript('Pode falar…');
      const heard = await speakThen('Pode falar.');
      if (!heard) {
        setMicBusy(false);
        setPhaseSafe('error');
        setErrorMsg(
          'Não consegui falar «Pode falar». Verifique a internet e tente de novo com «Falar agora».'
        );
        return;
      }
      // Pausa extra: Samsung precisa libertar o TTS antes do mic
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
      setErrorMsg(
        'Não captou voz. Fale de novo ou digite o comando abaixo e toque em Executar texto.'
      );
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
    void speakText('Nota do agendamento guardada.');
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
            <Text style={styles.title}>Falar com SeCretina</Text>
            {ambiguous.length === 0 ? (
              <Text style={styles.subtitle}>
                Diga «Olá {wakeName}» ou use o botão. Com o servidor Railway,
                a assistente interpreta nota e agenda no mesmo pedido.
                {'\n'}
                Ex.: «agenda com Paulo amanhã às 15 e anota que é proposta»
              </Text>
            ) : null}

            {phase === 'speaking' ? (
              <Text style={styles.listening}>{liveTranscript || 'A falar…'}</Text>
            ) : null}

            {phase === 'listening' ? (
              <Text style={styles.listening}>
                {liveTranscript.trim()
                  ? liveTranscript
                  : listenModeRef.current === 'pick_contact'
                    ? 'Microfone activo — diga o número ou o sobrenome'
                    : 'Microfone activo — fale agora o comando'}
              </Text>
            ) : null}

            {phase === 'processing' ? (
              <Text style={styles.listening}>A processar…</Text>
            ) : null}

            {phase === 'done' && result?.ok ? (
              <>
                <Text style={styles.success}>{result.message}</Text>
                {(result.kind === 'note' || result.kind === 'mixed') &&
                result.noteBody ? (
                  <>
                    <Text style={styles.label}>Nota</Text>
                    <Text style={styles.notePreview}>{result.noteBody}</Text>
                  </>
                ) : null}
                {result.kind === 'schedule' || result.kind === 'mixed' ? (
                  <>
                    <Text style={styles.notePreview}>
                      Guardado na Agenda do app.
                    </Text>
                    {result.kind === 'schedule' && !result.noteBody ? (
                      scheduleNotePreview ? (
                        <>
                          <Text style={styles.label}>Nota do agendamento</Text>
                          <Text style={styles.notePreview}>
                            {scheduleNotePreview}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.label}>
                            Quer acrescentar uma nota a este agendamento?
                          </Text>
                          <DictateNoteButton
                            title="Falar nota do agendamento"
                            onTranscript={(t) => void onScheduleNoteDictated(t)}
                          />
                        </>
                      )
                    ) : null}
                    <Button
                      title="Ver agenda"
                      onPress={() => {
                        handleClose();
                        router.push('/(tabs)/agenda');
                      }}
                    />
                  </>
                ) : (
                  <Button
                    title={`Abrir ${result.contact.name}`}
                    onPress={() => {
                      handleClose();
                      router.push(`/contact/${result.contact.id}`);
                    }}
                  />
                )}
              </>
            ) : null}

            {phase === 'error' && errorMsg ? (
              <Text style={styles.error}>{errorMsg}</Text>
            ) : null}

            {ambiguous.length > 0 ? (
              <>
                <Text style={styles.label}>
                  Escolha o contacto — diga o número ou toque
                </Text>
                <View style={styles.pickList}>
                  {ambiguous.map((c, i) => (
                    <Pressable
                      key={c.id}
                      style={styles.pickRow}
                      onPress={() => pickContact(c)}
                    >
                      <Text style={styles.pickText}>
                        {i + 1}. {c.name?.trim() || 'Sem nome'}
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
              <Button title="Parar e executar" onPress={stopListening} />
            ) : (
              <Button
                title={
                  phase === 'idle' || phase === 'error' || phase === 'done'
                    ? 'Falar agora'
                    : 'Aguarde…'
                }
                onPress={() => void startListening({ skipGreet: true })}
                disabled={
                  phase === 'processing' || phase === 'speaking'
                }
              />
            )}

            {ambiguous.length === 0 ? (
              <>
                <Text style={styles.label}>Ou digite / confirme o comando</Text>
                <TextInput
                  style={styles.input}
                  multiline
                  placeholder="agenda com Paulo Silva amanhã às 15…"
                  value={typedFallback}
                  onChangeText={setTypedFallback}
                  editable={phase !== 'processing'}
                />
                <Button
                  title="Executar texto"
                  variant="secondary"
                  onPress={submitTyped}
                  disabled={!typedFallback.trim() || phase === 'processing'}
                />
              </>
            ) : null}

            <Button title="Fechar" variant="ghost" onPress={handleClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
