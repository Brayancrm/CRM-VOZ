import type {
  CallDetectorCallback,
  CallDetectorHandle,
  CallDetectorSupport,
} from './types';

export function getCallDetectorSupport(): CallDetectorSupport {
  return {
    supported: false,
    reason: 'Detecção de chamada não disponível na versão web.',
  };
}

export function startCallDetector(
  _onEvent: CallDetectorCallback
): CallDetectorHandle | null {
  return null;
}
