import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { SecretinaAssistantModal } from '@/components/SecretinaAssistantModal';
import { SecretinaFab } from '@/components/SecretinaFab';
import {
  abortSpeechRecognition,
  ensureSpeechPermission,
} from '@/services/speechDictate';
import {
  getWakeListenEnabled,
  setWakeListenEnabled,
} from '@/services/wakeListenSettings';
import {
  DEFAULT_WAKE_NAME,
  getWakeName,
  matchesWakePhrase,
} from '@/services/secretinaSettings';

type OpenAssistantOpts = {
  autoListen?: boolean;
  /** Diz «Pode falar» (OpenAI TTS se houver chave) antes de abrir o mic. */
  greetFirst?: boolean;
};

type SecretinaAssistantContextValue = {
  openAssistant: (opts?: OpenAssistantOpts) => void;
  closeAssistant: () => void;
  assistantOpen: boolean;
  autoListenOnOpen: boolean;
  greetFirstOnOpen: boolean;
  clearAutoListen: () => void;
  setMicBusy: (busy: boolean) => void;
  wakeEnabled: boolean;
  setWakeEnabled: (enabled: boolean) => Promise<void>;
  wakeListening: boolean;
  wakeName: string;
  refreshWakeName: () => Promise<void>;
};

const SecretinaAssistantContext =
  createContext<SecretinaAssistantContextValue>({
    openAssistant: () => {},
    closeAssistant: () => {},
    assistantOpen: false,
    autoListenOnOpen: false,
    greetFirstOnOpen: false,
    clearAutoListen: () => {},
    setMicBusy: () => {},
    wakeEnabled: false,
    setWakeEnabled: async () => {},
    wakeListening: false,
    wakeName: DEFAULT_WAKE_NAME,
    refreshWakeName: async () => {},
  });

export function useSecretinaAssistant() {
  return useContext(SecretinaAssistantContext);
}

export function SecretinaAssistantProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [autoListenOnOpen, setAutoListenOnOpen] = useState(false);
  const [greetFirstOnOpen, setGreetFirstOnOpen] = useState(false);
  const [wakeEnabled, setWakeEnabledState] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeName, setWakeNameState] = useState(DEFAULT_WAKE_NAME);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active'
  );
  const micBusyRef = useRef(false);
  const wakeEnabledRef = useRef(false);
  const assistantOpenRef = useRef(false);
  const wakeNameRef = useRef(DEFAULT_WAKE_NAME);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeHandledAt = useRef(0);

  const refreshWakeName = useCallback(async () => {
    const name = await getWakeName();
    wakeNameRef.current = name;
    setWakeNameState(name);
  }, []);

  useEffect(() => {
    void getWakeListenEnabled().then((v) => {
      setWakeEnabledState(v);
      wakeEnabledRef.current = v;
    });
    void refreshWakeName();
    // Pré-aquece «Pode falar» se o proxy Railway estiver configurado
    void import('@/services/speech')
      .then((m) => m.prefetchPodeFalar())
      .catch(() => {});
  }, [refreshWakeName]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
    });
    return () => sub.remove();
  }, []);

  const openAssistant = useCallback((opts?: OpenAssistantOpts) => {
    // Cancela TTS/wake presos de sessões anteriores
    void import('@/services/speech')
      .then((m) => m.stopSpeaking())
      .catch(() => {});
    abortSpeechRecognition();
    setWakeListening(false);

    const alreadyOpen = assistantOpenRef.current;
    const greet = Boolean(opts?.greetFirst);
    const auto = Boolean(opts?.autoListen ?? opts?.greetFirst);

    const show = () => {
      // micBusy só durante o fluxo do modal; não deixar preso se falhar o auto-start
      micBusyRef.current = Boolean(auto);
      setGreetFirstOnOpen(greet);
      setAutoListenOnOpen(auto);
      setAssistantOpen(true);
      assistantOpenRef.current = true;
    };

    if (alreadyOpen) {
      setAssistantOpen(false);
      assistantOpenRef.current = false;
      micBusyRef.current = false;
      setTimeout(show, 120);
      return;
    }
    show();
  }, []);

  const closeAssistant = useCallback(() => {
    void import('@/services/speech')
      .then((m) => m.stopSpeaking())
      .catch(() => {});
    abortSpeechRecognition();
    setAssistantOpen(false);
    assistantOpenRef.current = false;
    setAutoListenOnOpen(false);
    setGreetFirstOnOpen(false);
    micBusyRef.current = false;
  }, []);

  const openAssistantFromUrl = useCallback(
    (url: string | null) => {
      if (!url) return;
      const lower = url.toLowerCase();
      if (
        lower.includes('://assistant') ||
        lower.includes('/assistant') ||
        lower.includes('falar')
      ) {
        openAssistant({ autoListen: true, greetFirst: true });
      }
    },
    [openAssistant]
  );

  useEffect(() => {
    void Linking.getInitialURL().then(openAssistantFromUrl);
    const sub = Linking.addEventListener('url', ({ url }) => {
      openAssistantFromUrl(url);
    });
    return () => sub.remove();
  }, [openAssistantFromUrl]);

  const clearAutoListen = useCallback(() => {
    setAutoListenOnOpen(false);
    setGreetFirstOnOpen(false);
  }, []);

  const setMicBusy = useCallback((busy: boolean) => {
    micBusyRef.current = busy;
    if (busy) {
      setWakeListening(false);
    }
  }, []);

  const setWakeEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const ok = await ensureSpeechPermission();
      if (!ok) {
        throw new Error(
          'Permita microfone e reconhecimento de voz para o chamamento.'
        );
      }
    }
    await setWakeListenEnabled(enabled);
    wakeEnabledRef.current = enabled;
    setWakeEnabledState(enabled);
    if (!enabled) {
      if (!assistantOpenRef.current && !micBusyRef.current) {
        abortSpeechRecognition();
      }
      setWakeListening(false);
    }
  }, []);

  const startWakeListen = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (!wakeEnabledRef.current) return;
    if (!appActive) return;
    if (assistantOpenRef.current || micBusyRef.current) return;

    void (async () => {
      try {
        const { getSpeechLocale } = await import('@/services/secretinaLanguage');
        const lang = await getSpeechLocale();
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: true,
        });
        setWakeListening(true);
      } catch {
        setWakeListening(false);
      }
    })();
  }, [appActive]);

  const scheduleWakeRestart = useCallback(() => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      if (
        wakeEnabledRef.current &&
        !assistantOpenRef.current &&
        !micBusyRef.current &&
        AppState.currentState === 'active'
      ) {
        startWakeListen();
      }
    }, 1200);
  }, [startWakeListen]);

  useEffect(() => {
    if (
      wakeEnabled &&
      appActive &&
      !assistantOpen &&
      Platform.OS !== 'web'
    ) {
      scheduleWakeRestart();
    } else {
      setWakeListening(false);
      if (!assistantOpenRef.current && !micBusyRef.current) {
        abortSpeechRecognition();
      }
    }
    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, [wakeEnabled, appActive, assistantOpen, scheduleWakeRestart]);

  useSpeechRecognitionEvent('result', (event) => {
    if (assistantOpenRef.current || micBusyRef.current) return;
    if (!wakeEnabledRef.current) return;

    const text = event.results[0]?.transcript ?? '';
    if (!matchesWakePhrase(text, wakeNameRef.current)) return;

    const now = Date.now();
    if (now - wakeHandledAt.current < 2500) return;
    wakeHandledAt.current = now;

    openAssistant({ autoListen: true, greetFirst: true });
  });

  useSpeechRecognitionEvent('end', () => {
    setWakeListening(false);
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      !micBusyRef.current
    ) {
      scheduleWakeRestart();
    }
  });

  useSpeechRecognitionEvent('error', () => {
    setWakeListening(false);
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      !micBusyRef.current
    ) {
      scheduleWakeRestart();
    }
  });

  const value = useMemo(
    () => ({
      openAssistant,
      closeAssistant,
      assistantOpen,
      autoListenOnOpen,
      greetFirstOnOpen,
      clearAutoListen,
      setMicBusy,
      wakeEnabled,
      setWakeEnabled,
      wakeListening,
      wakeName,
      refreshWakeName,
    }),
    [
      openAssistant,
      closeAssistant,
      assistantOpen,
      autoListenOnOpen,
      greetFirstOnOpen,
      clearAutoListen,
      setMicBusy,
      wakeEnabled,
      setWakeEnabled,
      wakeListening,
      wakeName,
      refreshWakeName,
    ]
  );

  return (
    <SecretinaAssistantContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <SecretinaFab />
        <SecretinaAssistantModal
          visible={assistantOpen}
          onClose={closeAssistant}
        />
      </View>
    </SecretinaAssistantContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
