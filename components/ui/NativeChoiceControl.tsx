import { nativeUI } from '@/lib/nativeUI';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export type ChoiceOption<T extends string> = { value: T; label: string; accessibilityLabel?: string };

// 호출부가 기존 UI 폴백을 소유한다. 실제 선택값·방문 이력도 호출부에 남긴다.
export default function NativeChoiceControl<T extends string>({ value, options, label, presentation, onChange, enabled = true }: {
  value: T;
  options: readonly ChoiceOption<T>[];
  label: string;
  presentation: 'menu' | 'segmented';
  onChange: (value: T) => void;
  enabled?: boolean;
}) {
  const scheme = useColorScheme() ?? 'light';
  if (!nativeUI) return null;
  const { Host, Picker, Text } = nativeUI.views;
  const { accessibilityIdentifier, accessibilityLabel, disabled, frame, labelsHidden, pickerStyle, tag } = nativeUI.modifiers;
  return <Host colorScheme={scheme} seedColor={Colors[scheme].text} ignoreSafeArea="container"
    matchContents={presentation === 'menu' ? true : { vertical: true }}
    style={presentation === 'segmented' ? { width: '100%', minHeight: 44 } : { minHeight: 44 }}>
    <Picker label={label} selection={value}
      onSelectionChange={(selected: T) => {
        if (enabled && selected !== value && options.some(option => option.value === selected)) onChange(selected);
      }}
      modifiers={[pickerStyle(presentation), labelsHidden(), frame({ minHeight: 44 }),
        accessibilityIdentifier(`native-choice-${label}`), disabled(!enabled)]}>
      {options.map(option => <Text key={option.value}
        modifiers={[tag(option.value), ...(option.accessibilityLabel ? [accessibilityLabel(option.accessibilityLabel)] : [])]}>
        {option.label}
      </Text>)}
    </Picker>
  </Host>;
}
