import { useMemo } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  type PressableProps,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useColors } from '@/context/ThemeContext';
import type { ThemeColors } from '@/constants/palettes';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    primary: { backgroundColor: colors.primary },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    danger: { backgroundColor: colors.danger },
    ghost: { backgroundColor: 'transparent' },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.5 },
    text: { fontSize: 16, fontWeight: '600' },
    primaryText: { color: '#fff' },
    secondaryText: { color: colors.text },
    dangerText: { color: '#fff' },
    ghostText: { color: colors.primary },
  });
}

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...rest
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#fff' : colors.primary}
        />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles]]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
