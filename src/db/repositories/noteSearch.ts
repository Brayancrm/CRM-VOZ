import { Platform } from 'react-native';
import type { NoteSearchHit } from '@/db/repositories/noteSearch.types';

export type { NoteSearchHit } from '@/db/repositories/noteSearch.types';

export async function searchNotesGlobally(
  query: string,
  limit = 50
): Promise<NoteSearchHit[]> {
  if (Platform.OS === 'web') {
    const mod = await import('@/db/repositories/noteSearch.web');
    return mod.searchNotesGlobally(query, limit);
  }
  const mod = await import('@/db/repositories/noteSearch.native');
  return mod.searchNotesGlobally(query, limit);
}
