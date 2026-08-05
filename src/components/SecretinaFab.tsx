import { Pressable, StyleSheet, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecretinaAssistant } from '@/context/SecretinaAssistantContext';
import { useColors } from '@/context/ThemeContext';

/**
 * Botão flutuante global para abrir o SeCretina rapidamente.
 * Visível em todo o app (enquanto o assistente não está aberto).
 */
export function SecretinaFab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { openAssistant, assistantOpen } = useSecretinaAssistant();

  if (assistantOpen) return null;

  // Acima da tab bar (~56) + safe area
  const bottom = Math.max(insets.bottom, 8) + 64;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Falar com SeCretina"
      onPress={() => openAssistant({ autoListen: true, greetFirst: true })}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.88 : 1,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
            },
            android: { elevation: 6 },
            default: {},
          }),
        },
      ]}
    >
      <Text style={styles.icon}>🎙️</Text>
      <Text style={styles.label}>SeCretina</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    zIndex: 50,
    elevation: 6,
    minWidth: 56,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 20,
    lineHeight: 24,
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
