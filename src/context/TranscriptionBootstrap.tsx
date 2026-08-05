import { useEffect, type ReactNode } from 'react';
import { bootstrapTranscriptionQueue } from '@/services/transcriptionQueue';
import { syncDeviceCalendarReminders } from '@/services/deviceCalendarReminders';

/** Fila de transcrição + lembretes do calendário nativo ao abrir o app. */
export function TranscriptionBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void bootstrapTranscriptionQueue();
    void syncDeviceCalendarReminders();

    const id = setInterval(() => {
      void bootstrapTranscriptionQueue();
      void syncDeviceCalendarReminders();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}
