import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  type EmitterSubscription,
  type NativeModule,
} from 'react-native';
import type {
  CallDetectorCallback,
  CallDetectorHandle,
  CallDetectorSupport,
} from './types';

const EVENT_NAME = 'KooMindPhoneCallState';

type NativeAndroid = {
  startListener: () => void;
  stopJsListener?: () => void;
  stopListener: () => void;
  addListener?: (event: string) => void;
  removeListeners?: (count: number) => void;
};

const nativeModule = NativeModules.CallDetectionManagerAndroid as
  | NativeAndroid
  | undefined;

function mapNativeEvent(event: string): import('./types').PhoneCallEvent | null {
  switch (event) {
    case 'Incoming':
    case 'Offhook':
    case 'Disconnected':
    case 'Missed':
    case 'Connected':
    case 'Dialing':
      return event;
    default:
      return null;
  }
}

export function getCallDetectorSupport(): CallDetectorSupport {
  if (Platform.OS !== 'android') {
    return { supported: false, reason: 'Somente Android.' };
  }
  if (!nativeModule?.startListener) {
    return {
      supported: false,
      reason:
        'Módulo nativo não encontrado. Gere e instale um APK novo (npm run build:apk:release).',
    };
  }
  return { supported: true };
}

export function startCallDetector(
  onEvent: CallDetectorCallback
): CallDetectorHandle | null {
  if (Platform.OS !== 'android' || !nativeModule?.startListener) {
    return null;
  }

  const subscriptions: EmitterSubscription[] = [];
  const emitter = new NativeEventEmitter(
    nativeModule as unknown as NativeModule
  );

  subscriptions.push(
    emitter.addListener(
      EVENT_NAME,
      (payload: { state?: string; phoneNumber?: string; sessionId?: string }) => {
        const mapped = payload?.state ? mapNativeEvent(payload.state) : null;
        if (!mapped) return;
        const phone =
          payload.phoneNumber && payload.phoneNumber.length > 0
            ? payload.phoneNumber
            : undefined;
        const sessionId =
          payload.sessionId && payload.sessionId.length > 0
            ? payload.sessionId
            : undefined;
        onEvent(mapped, phone, sessionId);
      }
    )
  );

  try {
    nativeModule.startListener();
  } catch (e) {
    console.warn('KooMind: startListener falhou', e);
    subscriptions.forEach((s) => s.remove());
    return null;
  }

  return {
    dispose: () => {
      subscriptions.forEach((s) => s.remove());
      try {
        /* Não para o serviço nativo — detecção continua em background. */
        if (nativeModule.stopJsListener) {
          nativeModule.stopJsListener();
        }
      } catch {
        /* já parado */
      }
    },
  };
}
