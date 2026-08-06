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
  /** Diz o cumprimento antes de abrir o mic. */
  greetFirst?: boolean;
};

type SecretinaAssistantContextValue = {
  openAssistant: (opts?: OpenAssistantOpts) => void;
  closeAssistant: () => void;
  assistantOpen: boolean;
  /** Incrementa a cada abertura — remonta o modal (sessão limpa). */
  openToken: number;
  autoListenOnOpen: boolean;
  greetFirstOnOpen: boolean;
  clearAutoListen: () => void;
  setMicBusy: (busy: boolean) => void;
  wakeEnabled: boolean;
  setWakeEnabled: (enabled: boolean) => Promise<void>;
  wakeListening: boolean;
  wakeName: string;
  refreshWakeName: () => Promise<void>;
  /** Ao mudar idioma: para TTS/STT, limpa cache, pré-aquece, reinicia wake. */
  refreshVoicePipeline: () => Promise<void>;
};

const SecretinaAssistantContext =
  createContext<SecretinaAssistantContextValue>({
    openAssistant: () => {},
    closeAssistant: () => {},
    assistantOpen: false,
    openToken: 0,
    autoListenOnOpen: false,
    greetFirstOnOpen: false,
    clearAutoListen: () => {},
    setMicBusy: () => {},
    wakeEnabled: false,
    setWakeEnabled: async () => {},
    wakeListening: false,
    wakeName: DEFAULT_WAKE_NAME,
    refreshWakeName: async () => {},
    refreshVoicePipeline: async () => {},
  });

export function useSecretinaAssistant() {
  return useContext(SecretinaAssistantContext);
}

const WAKE_WATCHDOG_MS = 8_000;
/** Reinício preventivo se o motor ficar sem eventos demasiado tempo (Samsung). */
const WAKE_STALE_MS = 40_000;

export function SecretinaAssistantProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [openToken, setOpenToken] = useState(0);
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
  const wakeListeningRef = useRef(false);
  const lastWakeAliveAt = useRef(Date.now());
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
    void import('@/services/speech')
      .then((m) => m.stopSpeaking())
      .catch(() => {});
    abortSpeechRecognition();
    setWakeListening(false);
    wakeListeningRef.current = false;

    const greet = Boolean(opts?.greetFirst);
    const auto = Boolean(opts?.autoListen ?? opts?.greetFirst);

    micBusyRef.current = Boolean(auto);
    setGreetFirstOnOpen(greet);
    setAutoListenOnOpen(auto);
    // Nova sessão = remonta o modal (estado limpo, sem locks antigos)
    setOpenToken((n) => n + 1);
    setAssistantOpen(true);
    assistantOpenRef.current = true;
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
      wakeListeningRef.current = false;
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
      wakeListeningRef.current = false;
    }
  }, []);

  const startWakeListen = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (!wakeEnabledRef.current) return;
    if (!appActive) return;
    if (assistantOpenRef.current || micBusyRef.current) return;

    void (async () => {
      try {
        abortSpeechRecognition();
        await new Promise((r) => setTimeout(r, 180));
        if (assistantOpenRef.current || micBusyRef.current) return;
        if (!wakeEnabledRef.current) return;

        const { getSpeechLocale } = await import('@/services/secretinaLanguage');
        const lang = await getSpeechLocale();
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: true,
        });
        lastWakeAliveAt.current = Date.now();
        wakeListeningRef.current = true;
        setWakeListening(true);
      } catch {
        wakeListeningRef.current = false;
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
    }, 900);
  }, [startWakeListen]);

  const refreshVoicePipeline = useCallback(async () => {
    try {
      const { hardResetVoicePipeline } = await import('@/services/speech');
      await hardResetVoicePipeline();
    } catch {
      /* ignore */
    }
    abortSpeechRecognition();
    micBusyRef.current = false;
    wakeListeningRef.current = false;
    setWakeListening(false);
    lastWakeAliveAt.current = 0;
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      AppState.currentState === 'active'
    ) {
      scheduleWakeRestart();
    }
  }, [scheduleWakeRestart]);

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
      wakeListeningRef.current = false;
      if (!assistantOpenRef.current && !micBusyRef.current) {
        abortSpeechRecognition();
      }
    }
    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, [wakeEnabled, appActive, assistantOpen, scheduleWakeRestart]);

  // Watchdog: se o wake deveria estar activo e ficou morto/stale, reinicia
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!wakeEnabled || !appActive || assistantOpen) return;

    const id = setInterval(() => {
      if (assistantOpenRef.current || micBusyRef.current) return;
      if (!wakeEnabledRef.current) return;
      if (AppState.currentState !== 'active') return;

      const stale = Date.now() - lastWakeAliveAt.current > WAKE_STALE_MS;
      if (!wakeListeningRef.current || stale) {
        abortSpeechRecognition();
        wakeListeningRef.current = false;
        setWakeListening(false);
        scheduleWakeRestart();
      }
    }, WAKE_WATCHDOG_MS);

    return () => clearInterval(id);
  }, [wakeEnabled, appActive, assistantOpen, scheduleWakeRestart]);

  useSpeechRecognitionEvent('result', (event) => {
    if (assistantOpenRef.current || micBusyRef.current) return;
    if (!wakeEnabledRef.current) return;

    lastWakeAliveAt.current = Date.now();

    const text = event.results[0]?.transcript ?? '';
    if (!matchesWakePhrase(text, wakeNameRef.current)) return;

    const now = Date.now();
    if (now - wakeHandledAt.current < 2000) return;
    wakeHandledAt.current = now;

    openAssistant({ autoListen: true, greetFirst: true });
  });

  useSpeechRecognitionEvent('end', () => {
    wakeListeningRef.current = false;
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
    wakeListeningRef.current = false;
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
      openToken,
      autoListenOnOpen,
      greetFirstOnOpen,
      clearAutoListen,
      setMicBusy,
      wakeEnabled,
      setWakeEnabled,
      wakeListening,
      wakeName,
      refreshWakeName,
      refreshVoicePipeline,
    }),
    [
      openAssistant,
      closeAssistant,
      assistantOpen,
      openToken,
      autoListenOnOpen,
      greetFirstOnOpen,
      clearAutoListen,
      setMicBusy,
      wakeEnabled,
      setWakeEnabled,
      wakeListening,
      wakeName,
      refreshWakeName,
      refreshVoicePipeline,
    ]
  );

  return (
    <SecretinaAssistantContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <SecretinaFab />
        {assistantOpen ? (
          <SecretinaAssistantModal
            key={openToken}
            visible
            onClose={closeAssistant}
          />
        ) : null}
      </View>
    </SecretinaAssistantContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
