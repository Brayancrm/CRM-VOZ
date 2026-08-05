import { NativeModules, Platform } from 'react-native';

type CallDetectionNative = {
  getLastCallNumber?: () => Promise<string>;
};

const native = NativeModules.CallDetectionManagerAndroid as
  | CallDetectionNative
  | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Último número no registro (janela recente no nativo). */
export async function getLastCallNumberFromLog(): Promise<string | undefined> {
  if (Platform.OS !== 'android' || !native?.getLastCallNumber) {
    return undefined;
  }
  try {
    const raw = await native.getLastCallNumber();
    const trimmed = raw?.trim();
    const digits = trimmed?.replace(/\D/g, '') ?? '';
    return digits.length >= 7 ? digits : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Samsung grava o CallLog alguns ms após desligar — várias leituras.
 */
export async function getLastCallNumberWithRetry(
  delaysMs: number[] = [0, 400, 900, 1800, 2800]
): Promise<string | undefined> {
  let last: string | undefined;
  let prev = 0;
  for (const delay of delaysMs) {
    const wait = delay - prev;
    if (wait > 0) await sleep(wait);
    prev = delay;
    const n = await getLastCallNumberFromLog();
    if (n) last = n;
    if (n && n.length >= 10) return n;
  }
  return last;
}
