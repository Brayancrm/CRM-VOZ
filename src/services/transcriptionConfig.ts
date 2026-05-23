import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_URL = 'crm_voz_transcription_api_url';
const KEY_SECRET = 'crm_voz_transcription_api_secret';

const envUrl = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() || '';
const envSecret = process.env.EXPO_PUBLIC_TRANSCRIPTION_API_SECRET?.trim() || '';

export async function getTranscriptionApiUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_URL);
  return (saved || envUrl).trim().replace(/\/$/, '');
}

export async function setTranscriptionApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY_URL, url.trim().replace(/\/$/, ''));
}

export async function getTranscriptionApiSecret(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_SECRET);
  return (saved || envSecret).trim();
}

export async function setTranscriptionApiSecret(secret: string): Promise<void> {
  await AsyncStorage.setItem(KEY_SECRET, secret.trim());
}

export async function isTranscriptionConfigured(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const url = await getTranscriptionApiUrl();
  return url.length > 0 && url.startsWith('http');
}
