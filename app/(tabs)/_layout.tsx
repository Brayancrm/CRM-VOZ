import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useColors } from '@/context/ThemeContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { useI18n } from '@/i18n';

function TabEmoji({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22, lineHeight: 26 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const colors = useColors();
  const { t, lang } = useI18n();

  return (
    <Tabs
      key={lang}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerRight: () => <ThemeToggleButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.contacts'),
          tabBarLabel: t('tabs.contacts'),
          tabBarIcon: () => <TabEmoji emoji="👥" />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: t('tabs.agenda'),
          tabBarLabel: t('tabs.agenda'),
          tabBarIcon: () => <TabEmoji emoji="📅" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settingsHeader'),
          tabBarLabel: t('tabs.settings'),
          tabBarIcon: () => <TabEmoji emoji="⚙️" />,
        }}
      />
    </Tabs>
  );
}
