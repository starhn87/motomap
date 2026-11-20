import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/AppText';
import { useColorScheme } from '@/components/useColorScheme';
import Colors, { androidLightControl } from '@/constants/Colors';

export default function AndroidReportReasonRow({ label, description, selected, disabled, onPress }: {
  label: string;
  description?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const surface = scheme === 'light' ? androidLightControl.backgroundColor : colors.surfaceMuted;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.tint + '24' }}
      style={[styles.row, { backgroundColor: selected ? colors.tint + '24' : surface }]}>
      <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={24} color={selected ? colors.tint : colors.textSecondary} />
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {!!description && (
          <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: '600' },
  description: { fontSize: 12 },
});
