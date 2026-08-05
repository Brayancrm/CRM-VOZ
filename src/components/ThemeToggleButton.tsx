import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  size?: number;
};

export function ThemeToggleButton({ size = 26 }: Props) {
  const { isDark, toggleTheme, colors } = useTheme();

  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: colors.border, backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
      accessibilityLabel={
        isDark ? 'Ativar modo claro' : 'Ativar modo escuro'
      }
      hitSlop={10}
    >
      <Text style={[styles.icon, { fontSize: size }]}>
        {isDark ? '☀️' : '🌙'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pressed: { opacity: 0.75 },
  icon: { lineHeight: 30 },
});
