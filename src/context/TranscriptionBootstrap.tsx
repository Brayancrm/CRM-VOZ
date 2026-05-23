import { useEffect, type ReactNode } from 'react';
import { processTranscriptionQueue } from '@/services/transcriptionQueue';

/** Processa fila de transcrição ao abrir o app e periodicamente. */
export function TranscriptionBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void processTranscriptionQueue();
    const id = setInterval(() => {
      void processTranscriptionQueue();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}
