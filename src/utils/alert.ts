import { Alert, Platform } from 'react-native';

/** Alert nativo no celular; no navegador usa window.alert (RN Alert não aparece na web). */
export function showAppAlert(
  title: string,
  message?: string,
  onDismiss?: () => void
): void {
  const body = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(body);
    }
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }]);
}

/** Alerta com ações extras (ex.: ir para Agenda sem fechar o app). */
export function showAppAlertActions(
  title: string,
  message: string,
  actions: { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }[]
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    actions.find((a) => a.style !== 'cancel')?.onPress?.();
    return;
  }
  Alert.alert(title, message, actions);
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
