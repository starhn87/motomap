import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';

import Colors, { androidLightControl } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type SearchAction = {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
  selected?: boolean;
};

function IconAction({ icon, label, onPress, selected }: SearchAction) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      android_ripple={{ color: scheme === 'light' ? '#18181B1F' : '#FFFFFF24' }}
      style={styles.action}>
      <MaterialIcons name={icon} size={24} color={selected ? colors.tint : colors.text} />
    </Pressable>
  );
}

export default function AndroidSearchBar({ children, onBack, backLabel = '뒤로 가기', onClear, onVoice, listening }: {
  children: ReactNode;
  onBack: () => void;
  backLabel?: string;
  onClear?: () => void;
  onVoice: () => void;
  listening: boolean;
}) {
  const scheme = useColorScheme() ?? 'light';
  const backgroundColor = scheme === 'light' ? androidLightControl.backgroundColor : Colors.dark.surfaceMuted;
  return (
    <View style={[styles.bar, { backgroundColor }]}>
      <IconAction icon={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'} label={backLabel} onPress={onBack} />
      {children}
      {!!onClear && <IconAction icon="close" label="검색어 지우기" onPress={onClear} />}
      <IconAction icon={listening ? 'mic' : 'mic-none'} label={listening ? '음성 검색 중지' : '음성 검색'}
        onPress={onVoice} selected={listening} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontSize: 16,
    includeFontPadding: false,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 24,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  action: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const androidSearchInputStyle = styles.input;
