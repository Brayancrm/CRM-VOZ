import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

let sound: Audio.Sound | null = null;
let playing = false;

export function isAudioPlaying(): boolean {
  return playing;
}

export async function playAudioFile(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('Arquivo de áudio não encontrado no aparelho.');
  }

  await stopAudio();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound: s } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true }
  );
  sound = s;
  playing = true;

  return new Promise((resolve, reject) => {
    s.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.error) {
        playing = false;
        reject(new Error(status.error));
        return;
      }
      if (status.didJustFinish) {
        stopAudio().then(resolve).catch(reject);
      }
    });
  });
}

export async function stopAudio(): Promise<void> {
  if (!sound) {
    playing = false;
    return;
  }
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    /* já descarregado */
  }
  sound = null;
  playing = false;
}
