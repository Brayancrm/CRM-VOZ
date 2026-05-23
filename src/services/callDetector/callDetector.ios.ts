import type {
  CallDetectorCallback,
  CallDetectorHandle,
  CallDetectorSupport,
} from './types';

export function getCallDetectorSupport(): CallDetectorSupport {
  return {
    supported: false,
    reason:
      'No iPhone a detecção automática de ligação celular é limitada. Use a simulação ou registre a nota manualmente na ficha do contato.',
  };
}

export function startCallDetector(
  _onEvent: CallDetectorCallback
): CallDetectorHandle | null {
  return null;
}
