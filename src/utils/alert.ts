import { Alert, Platform } from 'react-native';

/** Alert nativo no celular; no navegador usa window.alert (RN Alert não aparece na web). */
export function showAppAlert(title: string, message?: string): void {
  const body = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(body);
    }
    return;
  }
  Alert.alert(title, message);
}

export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
  ]);
}
