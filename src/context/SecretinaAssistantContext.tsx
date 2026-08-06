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
  greetFirst?: boolean;
};

type SecretinaAssistantContextValue = {
  openAssistant: (opts?: OpenAssistantOpts) => void;
  closeAssistant: () => void;
  assistantOpen: boolean;
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

const WAKE_WATCHDOG_MS = 10_000;
const WAKE_STALE_MS = 35_000;
/** Junta pedaços do STT («Olá» + «Bruno») durante esta janela. */
const WAKE_BUFFER_MS = 4500;

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
  const wakeStartingRef = useRef(false);
  const lastWakeAliveAt = useRef(Date.now());
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeHandledAt = useRef(0);
  const wakeBufferRef = useRef<{ text: string; at: number }[]>([]);

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

  // Rede de segurança: se o assistente fechou, micBusy NÃO pode bloquear o wake
  useEffect(() => {
    if (!assistantOpen) {
      assistantOpenRef.current = false;
      micBusyRef.current = false;
    }
  }, [assistantOpen]);

  const openAssistant = useCallback((opts?: OpenAssistantOpts) => {
    void import('@/services/speech')
      .then((m) => m.stopSpeaking())
      .catch(() => {});
    abortSpeechRecognition();
    setWakeListening(false);
    wakeListeningRef.current = false;
    wakeBufferRef.current = [];

    const greet = Boolean(opts?.greetFirst);
    const auto = Boolean(opts?.autoListen ?? opts?.greetFirst);

    micBusyRef.current = Boolean(auto);
    setGreetFirstOnOpen(greet);
    setAutoListenOnOpen(auto);
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
    wakeBufferRef.current = [];
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
      abortSpeechRecognition();
      setWakeListening(false);
      wakeListeningRef.current = false;
      wakeBufferRef.current = [];
    }
  }, []);

  const startWakeListen = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (!wakeEnabledRef.current) return;
    if (!appActive) return;
    if (assistantOpenRef.current || micBusyRef.current) return;
    if (wakeStartingRef.current) return;

    wakeStartingRef.current = true;
    void (async () => {
      try {
        abortSpeechRecognition();
        await new Promise((r) => setTimeout(r, 250));
        if (assistantOpenRef.current || micBusyRef.current) return;
        if (!wakeEnabledRef.current) return;
        if (AppState.currentState !== 'active') return;

        const { getSpeechLocale } = await import('@/services/secretinaLanguage');
        const { prepareMicForRecognition } = await import(
          '@/services/speechDictate'
        );
        await prepareMicForRecognition();

        const lang = await getSpeechLocale();
        // continuous:false = mais fiável no Samsung/Android; reiniciamos no "end"
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
          androidIntentOptions: {
            EXTRA_LANGUAGE_MODEL: 'free_form',
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1600,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
            EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 400,
          },
        });
        lastWakeAliveAt.current = Date.now();
        wakeListeningRef.current = true;
        setWakeListening(true);
      } catch (e) {
        console.warn('SeCretina wake start', e);
        wakeListeningRef.current = false;
        setWakeListening(false);
      } finally {
        wakeStartingRef.current = false;
      }
    })();
  }, [appActive]);

  const scheduleWakeRestart = useCallback(
    (delayMs = 700) => {
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
      }, delayMs);
    },
    [startWakeListen]
  );

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
    wakeStartingRef.current = false;
    setWakeListening(false);
    wakeBufferRef.current = [];
    lastWakeAliveAt.current = 0;
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      AppState.currentState === 'active'
    ) {
      scheduleWakeRestart(400);
    }
  }, [scheduleWakeRestart]);

  useEffect(() => {
    if (
      wakeEnabled &&
      appActive &&
      !assistantOpen &&
      Platform.OS !== 'web'
    ) {
      scheduleWakeRestart(400);
    } else {
      setWakeListening(false);
      wakeListeningRef.current = false;
      if (!assistantOpenRef.current) {
        abortSpeechRecognition();
      }
    }
    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, [wakeEnabled, appActive, assistantOpen, scheduleWakeRestart]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!wakeEnabled || !appActive || assistantOpen) return;

    const id = setInterval(() => {
      if (assistantOpenRef.current || micBusyRef.current) return;
      if (!wakeEnabledRef.current) return;
      if (AppState.currentState !== 'active') return;
      if (wakeStartingRef.current) return;

      const stale = Date.now() - lastWakeAliveAt.current > WAKE_STALE_MS;
      if (!wakeListeningRef.current || stale) {
        scheduleWakeRestart(300);
      }
    }, WAKE_WATCHDOG_MS);

    return () => clearInterval(id);
  }, [wakeEnabled, appActive, assistantOpen, scheduleWakeRestart]);

  const pushWakeBuffer = (piece: string) => {
    const now = Date.now();
    const cleaned = piece.trim();
    if (!cleaned) return;
    wakeBufferRef.current = [
      ...wakeBufferRef.current.filter((x) => now - x.at < WAKE_BUFFER_MS),
      { text: cleaned, at: now },
    ];
  };

  const bufferedWakeText = () =>
    wakeBufferRef.current.map((x) => x.text).join(' ');

  const tryOpenFromWake = (spoken: string) => {
    if (assistantOpenRef.current || micBusyRef.current) return;
    if (!wakeEnabledRef.current) return;

    pushWakeBuffer(spoken);
    const combined = bufferedWakeText();
    const hit =
      matchesWakePhrase(spoken, wakeNameRef.current) ||
      matchesWakePhrase(combined, wakeNameRef.current);
    if (!hit) return;

    const now = Date.now();
    if (now - wakeHandledAt.current < 1800) return;
    wakeHandledAt.current = now;
    wakeBufferRef.current = [];

    console.log('SeCretina wake hit:', combined || spoken);
    openAssistant({ autoListen: true, greetFirst: true });
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (assistantOpenRef.current || micBusyRef.current) return;
    if (!wakeEnabledRef.current) return;

    lastWakeAliveAt.current = Date.now();
    wakeListeningRef.current = true;

    // Usa o melhor resultado disponível (final ou parcial)
    const parts = (event.results ?? [])
      .map((r) => r?.transcript ?? '')
      .filter(Boolean);
    const text = parts.join(' ').trim() || event.results?.[0]?.transcript || '';
    if (!text.trim()) return;

    tryOpenFromWake(text);
  });

  useSpeechRecognitionEvent('end', () => {
    wakeListeningRef.current = false;
    setWakeListening(false);
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      !micBusyRef.current
    ) {
      scheduleWakeRestart(500);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    wakeListeningRef.current = false;
    setWakeListening(false);
    // no-speech é normal no ciclo short-utterance — só reinicia
    if (
      wakeEnabledRef.current &&
      !assistantOpenRef.current &&
      !micBusyRef.current
    ) {
      const delay =
        event?.error === 'no-speech' || event?.error === 'speech-timeout'
          ? 400
          : 900;
      scheduleWakeRestart(delay);
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
