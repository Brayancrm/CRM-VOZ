import { Platform } from 'react-native';

/** Aguarda o fechamento de modal antes de Alert ou recarregar (evita crash no Android). */
export function waitForModalClose(): Promise<void> {
  const ms = Platform.OS === 'android' ? 400 : 120;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
