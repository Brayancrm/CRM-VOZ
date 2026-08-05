import { useEffect, useRef, useState } from 'react';
import { Text, Platform, StyleSheet } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  abortSpeechRecognition,
  ensureSpeechPermission,
  prepareMicForRecognition,
  startCommandRecognition,
} from '@/services/speechDictate';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';
import { showAppAlert } from '@/utils/alert';
import { speakText, stopSpeaking } from '@/services/speech';

type Props = {
  /** Chamado com o texto final ditado. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  title?: string;
  listeningTitle?: string;
};

/**
 * Ditado direto para a nota do contato atual (sem comando «cria nota para…»).
 */
export function DictateNoteButton({
  onTranscript,
  disabled,
  title = 'Falar nota',
  listeningTitle = 'Ouvindo… toque para parar',
}: Props) {
  const { setMicBusy } = useSecretinaAssistant();
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const listeningRef = useRef(false);
  const handledRef = useRef(false);
  const partialRef = useRef('');

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      partial: {
        fontSize: 13,
        color: c.primary,
        marginBottom: 4,
        lineHeight: 18,
      },
    })
  );

  const finishWith = (text: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    listeningRef.current = false;
    setListening(false);
    setMicBusy(false);
    abortSpeechRecognition();
    const trimmed = text.trim();
    if (trimmed) {
      onTranscript(trimmed);
      void speakText('Nota transcrita.');
    } else {
      showAppAlert('Voz', 'Não ouvi nada. Tente de novo.');
    }
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (!listeningRef.current) return;
    const text = event.results[0]?.transcript ?? '';
    partialRef.current = text;
    setPartial(text);
    if (event.isFinal && text.trim()) {
      finishWith(text);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (!listeningRef.current || handledRef.current) return;
    if (partialRef.current.trim()) {
      finishWith(partialRef.current);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!listeningRef.current) return;
    if (event.error === 'aborted') return;
    if (partialRef.current.trim()) {
      finishWith(partialRef.current);
      return;
    }
    listeningRef.current = false;
    setListening(false);
    setMicBusy(false);
    abortSpeechRecognition();
    if (event.error !== 'aborted') {
      showAppAlert(
        'Voz',
        event.error === 'no-speech' || event.error === 'speech-timeout'
          ? 'Não ouvi nada. Tente de novo.'
          : event.message || 'Erro no reconhecimento.'
      );
    }
  });

  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        abortSpeechRecognition();
        setMicBusy(false);
      }
    };
  }, [setMicBusy]);

  const start = async () => {
    if (Platform.OS === 'web') {
      showAppAlert('Só no celular', 'Ditado por voz só funciona no app Android.');
      return;
    }
    const ok = await ensureSpeechPermission();
    if (!ok) {
      showAppAlert(
        'Permissão',
        'Permita microfone e reconhecimento de voz nas definições.'
      );
      return;
    }

    handledRef.current = false;
    setPartial('');
    partialRef.current = '';
    await stopSpeaking();
    abortSpeechRecognition();
    setMicBusy(true);
    listeningRef.current = true;
    setListening(true);

    try {
      await prepareMicForRecognition();
      startCommandRecognition();
    } catch (e) {
      listeningRef.current = false;
      setListening(false);
      setMicBusy(false);
      showAppAlert(
        'Voz',
        e instanceof Error ? e.message : 'Não foi possível ouvir.'
      );
    }
  };

  const stop = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    if (partialRef.current.trim()) {
      finishWith(partialRef.current);
    } else {
      listeningRef.current = false;
      setListening(false);
      setMicBusy(false);
      abortSpeechRecognition();
    }
  };

  return (
    <>
      {listening && partial ? (
        <Text style={styles.partial}>{partial}</Text>
      ) : null}
      <Button
        title={listening ? listeningTitle : title}
        variant={listening ? 'danger' : 'secondary'}
        onPress={() => (listening ? stop() : void start())}
        disabled={disabled && !listening}
      />
    </>
  );
}
