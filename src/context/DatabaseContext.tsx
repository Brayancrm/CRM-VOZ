import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import { useColors } from '@/context/ThemeContext';

async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    const { getDatabase } = await import('@/db/database.web');
    await getDatabase();
    return;
  }
  const { getDatabase } = await import('@/db/database.native');
  await getDatabase();
}

type DatabaseContextValue = {
  ready: boolean;
};

const DatabaseContext = createContext<DatabaseContextValue>({ ready: false });

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const colors = useColors();

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch(console.error);
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ ready }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabaseReady(): boolean {
  return useContext(DatabaseContext).ready;
}
