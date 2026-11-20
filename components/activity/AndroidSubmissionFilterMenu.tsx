import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DropdownMenu, DropdownMenuItem, Host, RNHostView, Text as MenuText } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { Text } from '@/components/ui/AppText';
import Colors, { androidLightControl } from '@/constants/Colors';
import type { SubmissionFilter } from './SubmissionFilterMenu';

export default function AndroidSubmissionFilterMenu({ value, options, selectedLabel, onChange, active }: {
  value: SubmissionFilter;
  options: readonly { value: SubmissionFilter; label: string }[];
  selectedLabel: string;
  onChange: (value: SubmissionFilter) => void;
  active: boolean;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { width, height, fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const expanded = active && open;

  useEffect(() => {
    setOpen(false);
  }, [active, width, height, fontScale]);

  return (
    <Host matchContents colorScheme={scheme} seedColor={colors.tint}>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setOpen(false)}
        color={scheme === 'light' ? androidLightControl.backgroundColor : colors.surfaceMuted}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="제보 종류"
              accessibilityValue={{ text: selectedLabel }}
              accessibilityState={{ expanded, disabled: !active }}
              disabled={!active}
              onPress={() => setOpen(true)}
              android_ripple={{ color: scheme === 'light' ? '#18181B1F' : '#FFFFFF24' }}
              style={styles.trigger}>
              <Text style={[styles.label, { color: colors.text }]}>{selectedLabel}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color={colors.textSecondary} />
            </Pressable>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {options.map(option => {
            const selected = value === option.value;
            return (
              <DropdownMenuItem key={option.value}
                enabled={active}
                modifiers={selected ? [semantics({ contentDescription: `${option.label}, 선택됨` })] : undefined}
                onClick={() => {
                  setOpen(false);
                  if (active && !selected) onChange(option.value);
                }}>
                <DropdownMenuItem.Text>
                  <MenuText color={colors.text} style={{ fontSize: 14, fontWeight: selected ? '600' : '400' }}>
                    {option.label}
                  </MenuText>
                </DropdownMenuItem.Text>
                {selected && (
                  <DropdownMenuItem.TrailingIcon>
                    <RNHostView matchContents>
                      <MaterialIcons name="check" size={20} color={colors.tint}
                        accessible={false} importantForAccessibility="no" />
                    </RNHostView>
                  </DropdownMenuItem.TrailingIcon>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 24,
    overflow: 'hidden',
  },
  label: { fontSize: 14, fontWeight: '500' },
});
