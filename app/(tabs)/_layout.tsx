import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useColors } from '@/context/ThemeContext';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

function TabEmoji({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22, lineHeight: 26 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const colors = useColors();

  return (
    <Tabs
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
          title: 'Contatos',
          tabBarLabel: 'Contatos',
          tabBarIcon: () => <TabEmoji emoji="👥" />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarLabel: 'Agenda',
          tabBarIcon: () => <TabEmoji emoji="📅" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SeCretina',
          tabBarLabel: 'Ajustes',
          tabBarIcon: () => <TabEmoji emoji="⚙️" />,
        }}
      />
    </Tabs>
  );
}
