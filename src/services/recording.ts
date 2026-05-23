import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

let recording: Audio.Recording | null = null;
let activeSessionId: string | null = null;

export async function requestMicrophonePermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

export async function startMicRecording(sessionId: string): Promise<void> {
  if (recording) {
    await stopMicRecording();
  }
  const granted = await requestMicrophonePermission();
  if (!granted) {
    throw new Error('Permissão de microfone negada.');
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  recording = rec;
  activeSessionId = sessionId;
}

export async function stopMicRecording(): Promise<{
  sessionId: string;
  uri: string;
} | null> {
  if (!recording || !activeSessionId) return null;
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  const sessionId = activeSessionId;
  recording = null;
  activeSessionId = null;
  if (!uri) return null;

  const dir = `${FileSystem.documentDirectory}recordings/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${sessionId}.m4a`;
  await FileSystem.moveAsync({ from: uri, to: dest });
  return { sessionId, uri: dest };
}

export function isRecording(): boolean {
  return recording !== null;
}

export function getActiveRecordingSessionId(): string | null {
  return activeSessionId;
}
