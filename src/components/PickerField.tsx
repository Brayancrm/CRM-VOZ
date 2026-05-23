import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { ReactNode } from 'react';
import { colors } from '@/constants/theme';

type Props = {
  caption: string;
  displayValue: string;
  selectedValue: string | number;
  onValueChange: (value: string | number) => void;
  children: ReactNode;
  wide?: boolean;
  half?: boolean;
  year?: boolean;
};

/** Um valor visível + picker (Android: dialog invisível, sem texto duplicado). */
export function PickerField({
  caption,
  displayValue,
  selectedValue,
  onValueChange,
  children,
  wide,
  half,
  year,
}: Props) {
  const isAndroid = Platform.OS === 'android';

  return (
    <View
      style={[
        styles.wrap,
        wide && styles.wide,
        half && styles.half,
        year && styles.year,
      ]}
    >
      <Text style={styles.caption}>{caption}</Text>

      {isAndroid ? (
        <View style={styles.valueRow}>
          <Text style={styles.display} numberOfLines={1} ellipsizeMode="clip">
            {displayValue}
          </Text>
          <Text style={styles.chevron}>▾</Text>
          <Picker
            selectedValue={selectedValue}
            onValueChange={onValueChange}
            mode="dialog"
            prompt={caption}
            style={styles.pickerOverlay}
            dropdownIconColor="transparent"
          >
            {children}
          </Picker>
        </View>
      ) : (
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          style={styles.pickerIOS}
          itemStyle={styles.itemIOS}
        >
          {children}
        </Picker>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  wide: { flex: 1.55 },
  half: { flex: 1 },
  year: { flex: 1.15, minWidth: 72 },
  caption: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    marginTop: 2,
    paddingLeft: 10,
    paddingRight: 6,
    position: 'relative',
  },
  display: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    includeFontPadding: false,
  },
  chevron: {
    fontSize: 14,
    color: colors.primary,
    marginLeft: 4,
    paddingRight: 4,
  },
  pickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  pickerIOS: {
    height: 132,
    width: '100%',
  },
  itemIOS: {
    fontSize: 18,
    height: 120,
  },
});
