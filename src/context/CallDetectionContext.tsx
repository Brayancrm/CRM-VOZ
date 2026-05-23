import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getCallDetectorSupport,
  type CallDetectorSupport,
} from '@/services/callDetector';
import { setOnCallEnded } from '@/services/callOrchestrator';
import {
  getActiveCall,
  isCallRecordingActive,
} from '@/services/callFlow';
import { getContactById } from '@/db/repositories/contacts';
import { colors } from '@/constants/theme';

type CallDetectionContextValue = {
  support: CallDetectorSupport;
  isListening: boolean;
  activeContactName: string | null;
};

const CallDetectionContext = createContext<CallDetectionContextValue>({
  support: { supported: false },
  isListening: false,
  activeContactName: null,
});

export function useCallDetection() {
  return useContext(CallDetectionContext);
}

export function CallDetectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [support, setSupport] = useState<CallDetectorSupport>(() =>
    getCallDetectorSupport()
  );
  const [isListening, setIsListening] = useState(false);
  const [activeContactName, setActiveContactName] = useState<string | null>(
    null
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

  useEffect(() => {
    setOnCallEnded((payload) => {
      setActiveContactName(null);
      router.push({
        pathname: '/post-call/[sessionId]',
        params: {
          sessionId: payload.sessionId,
          contactId: payload.contactId,
          noteId: payload.noteId,
        },
      });
    });
    return () => setOnCallEnded(null);
  }, [router]);

  useEffect(() => {
    setSupport(getCallDetectorSupport());
  }, []);

  useEffect(() => {
    if (!isCallRecordingActive()) return;
    const id = setInterval(() => {
      void refreshActiveName();
    }, 2000);
    return () => clearInterval(id);
  }, [isListening, refreshActiveName]);

  const value = useMemo(
    () => ({ support, isListening, activeContactName }),
    [support, isListening, activeContactName]
  );

  const showBanner = isCallRecordingActive() && activeContactName;

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
          <Text style={styles.bannerTitle}>Gravando suas notas de voz</Text>
          <Text style={styles.bannerSub}>
            {activeContactName} — toque para ver o histórico
          </Text>
        </Pressable>
      ) : null}
      {children}
    </CallDetectionContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.primary,
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
});
