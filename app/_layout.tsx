import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { CallDetectionProvider } from '@/context/CallDetectionContext';
import { TranscriptionBootstrap } from '@/context/TranscriptionBootstrap';
import { colors } from '@/constants/theme';

function WebBanner() {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={bannerStyles.bar}>
      <Text style={bannerStyles.text}>
        Versão web (preview) — dados salvos no navegador. Celular: use Expo Go atualizado.
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <CallDetectionProvider>
      <TranscriptionBootstrap>
      <WebBanner />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
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
      </TranscriptionBootstrap>
      </CallDetectionProvider>
    </DatabaseProvider>
  );
}

const bannerStyles = StyleSheet.create({
  bar: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: { fontSize: 12, color: '#92400E', textAlign: 'center' },
});
