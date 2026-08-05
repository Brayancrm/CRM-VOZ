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
import {
  AppState,
  InteractionManager,
  Platform,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import {
  getCallDetectorSupport,
  startCallDetector,
  type CallDetectorSupport,
} from '@/services/callDetector';
import {
  handlePhoneEvent,
  resetCallOrchestrator,
  setOnCallEnded,
} from '@/services/callOrchestrator';
import {
  getActiveCall,
  isCallSessionActive,
  clearActiveCallState,
} from '@/services/callFlow';
import { getContactById } from '@/db/repositories/contacts';
import { requestPhoneStatePermission } from '@/services/phonePermissions';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  openPostCallScreen,
  parsePostCallSessionId,
} from '@/services/postCallNavigation';

type CallDetectionContextValue = {
  support: CallDetectorSupport;
  isListening: boolean;
  activeContactName: string | null;
  lastPhoneEvent: string | null;
  restartDetection: () => Promise<boolean>;
};

const CallDetectionContext = createContext<CallDetectionContextValue>({
  support: { supported: false },
  isListening: false,
  activeContactName: null,
  lastPhoneEvent: null,
  restartDetection: async () => false,
});

export function useCallDetection() {
  return useContext(CallDetectionContext);
}

export function CallDetectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [support, setSupport] = useState<CallDetectorSupport>({
    supported: false,
  });
  const [isListening, setIsListening] = useState(false);
  const [activeContactName, setActiveContactName] = useState<string | null>(
    null
  );
  const [lastPhoneEvent, setLastPhoneEvent] = useState<string | null>(null);
  const detectorRef = useRef<ReturnType<typeof startCallDetector>>(null);
  const startingRef = useRef(false);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      banner: {
        backgroundColor: c.primary,
        paddingVertical: 8,
        paddingHorizontal: 14,
      },
      bannerTitle: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
      },
      bannerSub: {
        color: '#E0F2F1',
        fontSize: 12,
        marginTop: 2,
      },
    })
  );

  const refreshActiveName = useCallback(async () => {
    const call = getActiveCall();
    if (!call) {
      setActiveContactName(null);
      return;
    }
    const c = await getContactById(call.contactId);
    setActiveContactName(c?.name ?? null);
  }, []);

  const stopDetector = useCallback(() => {
    detectorRef.current?.dispose();
    detectorRef.current = null;
    setIsListening(false);
  }, []);

  const startDetectorSafe = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    if (startingRef.current) return Boolean(detectorRef.current);

    const base = getCallDetectorSupport();
    setSupport(base);
    if (!base.supported) return false;

    startingRef.current = true;
    try {
      stopDetector();

      const permitted = await requestPhoneStatePermission();
      if (!permitted) {
        setSupport({
          supported: false,
          reason:
            'Permissão Telefone negada. Toque em «Solicitar permissões» em Ajustes.',
        });
        return false;
      }

      const handle = startCallDetector((event, phone, sessionId) => {
        const label = phone ? `${event} · ${phone}` : event;
        setLastPhoneEvent(`${new Date().toLocaleTimeString('pt-BR')} ${label}`);
        void handlePhoneEvent(event, phone, sessionId).then(() => {
          if (event === 'Offhook') void refreshActiveName();
          if (event === 'Disconnected') setActiveContactName(null);
        });
      });

      if (handle) {
        detectorRef.current = handle;
        setIsListening(true);
        setSupport({
          supported: true,
          reason:
            'Detecção ativa. Ao terminar uma ligação, o SeCretina identifica o contato e abre a nota.',
        });
        return true;
      }

      setSupport({
        supported: true,
        reason:
          'Não foi possível iniciar o detector. Toque em «Ativar detecção» ou reinstale o APK.',
      });
      return false;
    } catch (e) {
      console.warn('SeCretina: detector de chamada', e);
      setSupport({
        supported: false,
        reason: 'Erro ao iniciar detecção automática.',
      });
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [refreshActiveName, stopDetector]);

  const restartDetection = useCallback(async () => {
    return startDetectorSafe();
  }, [startDetectorSafe]);

  useEffect(() => {
    setOnCallEnded((payload) => {
      setActiveContactName(null);
      void openPostCallScreen(router, payload.sessionId);
    });
    return () => setOnCallEnded(null);
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const tick = () => {
      if (!isCallSessionActive()) {
        setActiveContactName(null);
        return;
      }
      void refreshActiveName();
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [refreshActiveName]);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const sessionId = parsePostCallSessionId(url);
      if (sessionId) {
        clearActiveCallState();
        void openPostCallScreen(router, sessionId);
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setSupport(getCallDetectorSupport());
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let retryId: ReturnType<typeof setTimeout> | null = null;

    const tryStart = () => {
      if (cancelled || detectorRef.current) return;
      attempt += 1;
      void startDetectorSafe().then((ok) => {
        if (cancelled || ok || detectorRef.current) return;
        if (attempt < 8) {
          retryId = setTimeout(tryStart, 3000);
        }
      });
    };

    const scheduleStart = () => {
      if (cancelled || detectorRef.current) return;
      retryId = setTimeout(tryStart, 600);
    };

    const interaction = InteractionManager.runAfterInteractions(scheduleStart);

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !detectorRef.current) {
        attempt = 0;
        scheduleStart();
      }
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (retryId) clearTimeout(retryId);
      detectorRef.current?.dispose();
      detectorRef.current = null;
      setIsListening(false);
      appSub.remove();
    };
  }, [startDetectorSafe]);

  const value = useMemo(
    () => ({
      support,
      isListening,
      activeContactName,
      lastPhoneEvent,
      restartDetection,
    }),
    [support, isListening, activeContactName, lastPhoneEvent, restartDetection]
  );

  const showBanner = Boolean(activeContactName && isCallSessionActive());

  return (
    <CallDetectionContext.Provider value={value}>
      {showBanner ? (
        <Pressable
          style={styles.banner}
          onPress={() => {
            const call = getActiveCall();
            if (call) router.push(`/contact/${call.contactId}`);
          }}
        >
          <Text style={styles.bannerTitle}>Em ligação</Text>
          <Text style={styles.bannerSub}>
            {activeContactName} — ao terminar, abre a nota
          </Text>
        </Pressable>
      ) : null}
      {children}
    </CallDetectionContext.Provider>
  );
}
