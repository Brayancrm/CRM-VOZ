import * as Speech from 'expo-speech';

let speaking = false;

export async function speakText(text: string): Promise<void> {
  await stopSpeaking();
  return new Promise((resolve, reject) => {
    speaking = true;
    Speech.speak(text, {
      language: 'pt-BR',
      onDone: () => {
        speaking = false;
        resolve();
      },
      onStopped: () => {
        speaking = false;
        resolve();
      },
      onError: (e) => {
        speaking = false;
        reject(e);
      },
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  if (speaking) {
    Speech.stop();
    speaking = false;
  }
}

export function isSpeaking(): boolean {
  return speaking;
}
