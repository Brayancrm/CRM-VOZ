import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useColors } from '@/context/ThemeContext';
import type { ThemeColors } from '@/constants/palettes';

type NamedStyles<T> = {
  [P in keyof T]: ViewStyle | TextStyle | ImageStyle;
};

export function useThemedStyles<T extends NamedStyles<T>>(
  creator: (colors: ThemeColors) => T
): T {
  const colors = useColors();
  return useMemo(() => StyleSheet.create(creator(colors)), [colors]);
}
