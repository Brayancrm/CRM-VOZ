import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text } from 'react-native';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { CallDetectionProvider } from '@/context/CallDetectionContext';
import { SecretinaAssistantProvider } from '@/context/SecretinaAssistantContext';
import { ThemeProvider, useColors, useTheme } from '@/context/ThemeContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { PermissionsGate } from '@/components/PermissionsGate';

function WebBanner() {
  const colors = useColors();
  if (Platform.OS !== 'web') return null;
  return (
    <View
      style={{
        backgroundColor: colors.warning + '33',
        paddingVertical: 6,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.text, textAlign: 'center' }}>
        Versão web (preview). No celular use o app SeCretina instalado.
      </Text>
    </View>
  );
}

function RootNavigator() {
  const colors = useColors();
  const { isDark } = useTheme();

  return (
    <>
      <WebBanner />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerRight: () => <ThemeToggleButton />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="contact/[id]"
          options={{ title: 'Contato', presentation: 'card' }}
        />
        <Stack.Screen
          name="contact/new"
          options={{ title: 'Novo contato', presentation: 'modal' }}
        />
        <Stack.Screen
          name="contact/edit/[id]"
          options={{ title: 'Editar contato', presentation: 'modal' }}
        />
        <Stack.Screen
          name="post-call/[sessionId]"
          options={{ title: 'Pós-chamada', presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <ThemeProvider>
        <PermissionsGate>
          <CallDetectionProvider>
            <SecretinaAssistantProvider>
              <RootNavigator />
            </SecretinaAssistantProvider>
          </CallDetectionProvider>
        </PermissionsGate>
      </ThemeProvider>
    </DatabaseProvider>
  );
}
