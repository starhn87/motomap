import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { nativeUI } from '@/lib/nativeUI';
import NativeChoiceControl from '@/components/ui/NativeChoiceControl';

const FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'places', label: '장소' },
  { value: 'feedback', label: '건의' },
] as const;
export type SubmissionFilter = typeof FILTERS[number]['value'];

export default function SubmissionFilterMenu({ value, onChange, active }: {
  value: SubmissionFilter;
  onChange: (value: SubmissionFilter) => void;
  active: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const trigger = useRef<View>(null);
  const measurementGeneration = useRef(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuWidth = Math.min(180, width - 32);
  const rowHeight = Math.max(44, Math.ceil(20 * fontScale) + 20);
  const menuHeight = rowHeight * FILTERS.length + 8;
  const selectedLabel = FILTERS.find(filter => filter.value === value)!.label;
  useEffect(() => {
    setAnchor(null);
    return () => { measurementGeneration.current++; };
  }, [active, width, height, fontScale]);

  const open = () => {
    if (!active) return;
    const generation = measurementGeneration.current;
    trigger.current?.measureInWindow((x, y, triggerWidth, triggerHeight) => {
      if (generation !== measurementGeneration.current) return;
      setAnchor({
        left: Math.max(16, Math.min(x + triggerWidth - menuWidth, width - menuWidth - 16)),
        top: Math.max(insets.top + 8, Math.min(y + triggerHeight + 4, height - insets.bottom - menuHeight - 8)),
      });
    });
  };

  if (nativeUI && active) return <NativeChoiceControl value={value} options={FILTERS} label="제보 종류"
    presentation="menu" onChange={onChange} enabled={active} />;

  return <>
    <Pressable ref={trigger} collapsable={false} onPress={open}
      accessibilityRole="button" accessibilityLabel="제보 종류"
      accessibilityValue={{ text: selectedLabel }} accessibilityState={{ expanded: !!anchor }}
      style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.label, { color: colors.text }]}>{selectedLabel}</Text>
      <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
    </Pressable>
    <Modal transparent visible={!!anchor && active} animationType="fade" statusBarTranslucent
      onRequestClose={() => setAnchor(null)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="필터 닫기"
          onPress={() => setAnchor(null)} />
        <View accessibilityViewIsModal style={[styles.menu, anchor,
          { width: menuWidth, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          {FILTERS.map(filter => <Pressable key={filter.value} accessibilityRole="menuitem"
            accessibilityState={{ selected: value === filter.value }}
            onPress={() => { setAnchor(null); onChange(filter.value); }}
            style={({ pressed }) => [styles.option, { minHeight: rowHeight,
              backgroundColor: pressed ? colors.surfaceMuted : 'transparent' }]}>
            <Text style={[styles.label, { color: colors.text }]}>{filter.label}</Text>
            {value === filter.value && <Ionicons name="checkmark" size={18} color={colors.text} />}
          </Pressable>)}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingLeft: 12 },
  label: { fontSize: 14, fontWeight: '500' },
  overlay: { flex: 1 },
  menu: { position: 'absolute', padding: 4, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  option: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10 },
});
