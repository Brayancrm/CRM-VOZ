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
import { I18nProvider, useI18n } from '@/i18n';

function WebBanner() {
  const colors = useColors();
  const { t } = useI18n();
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
        {t('web.banner')}
      </Text>
    </View>
  );
}

function RootNavigator() {
  const colors = useColors();
  const { isDark } = useTheme();
  const { t } = useI18n();

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
          options={{ title: t('stack.contact'), presentation: 'card' }}
        />
        <Stack.Screen
          name="contact/new"
          options={{ title: t('stack.newContact'), presentation: 'modal' }}
        />
        <Stack.Screen
          name="contact/edit/[id]"
          options={{ title: t('stack.editContact'), presentation: 'modal' }}
        />
        <Stack.Screen
          name="post-call/[sessionId]"
          options={{ title: t('stack.postCall'), presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <ThemeProvider>
        <I18nProvider>
          <PermissionsGate>
            <CallDetectionProvider>
              <SecretinaAssistantProvider>
                <RootNavigator />
              </SecretinaAssistantProvider>
            </CallDetectionProvider>
          </PermissionsGate>
        </I18nProvider>
      </ThemeProvider>
    </DatabaseProvider>
  );
}
