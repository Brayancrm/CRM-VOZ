import { initWebStore, resetWebStore } from '@/db/webStore';

export async function getDatabase(): Promise<{ ready: true }> {
  await initWebStore();
  return { ready: true };
}

export async function resetDatabaseForDev(): Promise<void> {
  resetWebStore();
  await initWebStore();
}
