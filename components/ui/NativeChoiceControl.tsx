import { useWindowDimensions } from 'react-native';
import { APP_FONT_FAMILY } from '@/lib/typography';
import { nativeUI, NativeSegmentedControl } from '@/lib/nativeUI';
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
  const { fontScale } = useWindowDimensions();
  if (presentation === 'segmented' && NativeSegmentedControl) return <NativeSegmentedControl
    accessibilityLabel={label}
    accessibilityHint={options.filter(option => option.accessibilityLabel).map(option => option.accessibilityLabel).join('. ') || undefined}
    testID={`native-choice-${label}`}
    values={options.map(option => option.label)}
    selectedIndex={options.findIndex(option => option.value === value)} appearance={scheme} enabled={enabled}
    style={{ width: '100%', height: Math.max(44, Math.round(36 * fontScale)) }}
    fontStyle={{ fontFamily: APP_FONT_FAMILY ? 'Pretendard-Medium' : undefined, fontSize: 15 * fontScale, fontWeight: '500', color: Colors[scheme].text }}
    activeFontStyle={{ fontFamily: APP_FONT_FAMILY ? 'Pretendard-SemiBold' : undefined, fontSize: 15 * fontScale, fontWeight: '600', color: Colors[scheme].text }}
    onChange={event => {
      const option = options[event.nativeEvent.selectedSegmentIndex];
      if (enabled && option && option.value !== value) onChange(option.value);
    }} />;
  if (!nativeUI) return null;
  const { Host, Picker, Text, HStack, Image, Menu } = nativeUI.views;
  const { accessibilityIdentifier, accessibilityLabel, accessibilityValue, accessibilityHidden, disabled, font, controlSize, frame, contentShape, shapes, foregroundStyle, buttonStyle, labelsHidden, pickerStyle, tag } = nativeUI.modifiers;
  const menuWidth = Math.max(72, Math.ceil(56 * fontScale) + 16);
  const menuHeight = Math.max(32, Math.ceil(24 * fontScale));
  if (presentation === 'menu') return <Host colorScheme={scheme} ignoreSafeArea="container"
    style={{ width: menuWidth, height: menuHeight }}>
    <Menu label={<HStack spacing={4} modifiers={[frame({ width: menuWidth, minHeight: menuHeight }), contentShape(shapes.rectangle())]}>
      <Text modifiers={[font({ family: APP_FONT_FAMILY ? 'Pretendard-Medium' : undefined, size: 13, textStyle: 'caption' }), foregroundStyle(Colors[scheme].text)]}>
        {options.find(option => option.value === value)?.label ?? ''}
      </Text>
      <Image systemName="chevron.down" size={10} color={Colors[scheme].textSecondary} modifiers={[accessibilityHidden()]} />
    </HStack>} modifiers={[buttonStyle('plain'), controlSize('mini'), disabled(!enabled),
      accessibilityIdentifier(`native-choice-${label}`), accessibilityLabel(label), accessibilityValue(options.find(option => option.value === value)?.label ?? '')]}>
      <Picker label={label} selection={value} onSelectionChange={(selected: T) => {
        if (enabled && selected !== value && options.some(option => option.value === selected)) onChange(selected);
      }} modifiers={[pickerStyle('inline'), labelsHidden()]}>
        {options.map(option => <Text key={option.value} modifiers={[tag(option.value)]}>{option.label}</Text>)}
      </Picker>
    </Menu>
  </Host>;
  return <Host colorScheme={scheme} seedColor={Colors[scheme].text} ignoreSafeArea="container"
    matchContents={{ vertical: true }}
    style={{ width: '100%', minHeight: 44 }}>
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
