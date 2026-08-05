import { Platform } from 'react-native';

/**
 * URL e secret vêm só do build (EXPO_PUBLIC_*), nunca dos Ajustes.
 * OPENAI_API_KEY fica exclusivamente no Railway.
 *
 * Defina no `.env` (ou secrets do EAS) antes de gerar o APK:
 *   EXPO_PUBLIC_TRANSCRIPTION_API_URL=https://seu-projeto.up.railway.app
 *   EXPO_PUBLIC_TRANSCRIPTION_API_SECRET=mesmo_valor_de_API_SECRET
 */
const envUrl = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() || '';
const envSecret = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_SECRET?.trim() || '';

export async function getTranscriptionApiUrl(): Promise<string> {
  return envUrl.replace(/\/$/, '');
}

export async function getTranscriptionApiSecret(): Promise<string> {
  return envSecret;
}

export async function isTranscriptionConfigured(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const url = await getTranscriptionApiUrl();
  return url.length > 0 && url.startsWith('http');
}
