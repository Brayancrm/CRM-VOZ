import type {
  CallDetectorCallback,
  CallDetectorHandle,
  CallDetectorSupport,
} from './types';

const MANUAL_REASON =
  'Detecção automática da linha telefônica ainda indisponível nesta versão (biblioteca incompatível). Na ficha do contato, use «Iniciar gravação» antes ou durante a ligação (celular ou WhatsApp).';

/** Detecção automática desligada até módulo nativo compatível (Fase 3b). */
export function getCallDetectorSupport(): CallDetectorSupport {
  return { supported: false, reason: MANUAL_REASON };
}

export function startCallDetector(
  _onEvent: CallDetectorCallback
): CallDetectorHandle | null {
  return null;
}
