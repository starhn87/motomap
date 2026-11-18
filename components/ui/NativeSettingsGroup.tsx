import { Fragment } from 'react';
import { View } from 'react-native';
import { nativeUI } from '@/lib/nativeUI';
import { APP_FONT_FAMILY } from '@/lib/typography';
import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export type SettingsRow = {
  key: string;
  label: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  connected?: boolean;
  chevron?: boolean;
};

// 바깥 RN ScrollView는 유지하고 가변 높이 SwiftUI 행만 호스팅한다.
// Form/List 스크롤을 중첩하지 않아 기존 헤더 흐림과 큰 글자 대응을 보존한다.
export default function NativeSettingsGroup({ rows }: { rows: SettingsRow[] }) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  if (!nativeUI) return null;
  const { Host, VStack, HStack, Text, Image, Spacer, Button, Divider, ProgressView } = nativeUI.views;
  const { accessibilityElement, accessibilityHidden, accessibilityIdentifier, buttonStyle, contentShape, disabled, font, foregroundStyle, frame, padding, shapes } = nativeUI.modifiers;
  return <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
    <Host matchContents={{ vertical: true }} colorScheme={scheme} seedColor={colors.text} ignoreSafeArea="container" style={{ minHeight: rows.length * 56 }}>
      <VStack spacing={0}>
        {rows.map((row, index) => {
          const content = <HStack spacing={12} modifiers={[padding({ horizontal: 16, vertical: 17 }), frame({ minHeight: 56, alignment: 'leading' }), contentShape(shapes.rectangle()), accessibilityElement('combine')]}>
            <Text modifiers={[font({ textStyle: 'body', family: APP_FONT_FAMILY ? 'Pretendard-Regular' : undefined, size: 16 }), foregroundStyle(row.destructive ? semantic.danger : colors.text)]}>{row.label}</Text>
            <Spacer minLength={8} />
            {row.loading ? <ProgressView /> : <>
              {row.value && <Text modifiers={[font({ textStyle: 'subheadline', family: APP_FONT_FAMILY ? 'Pretendard-Regular' : undefined, size: 14 }), foregroundStyle(colors.textSecondary)]}>{row.value}</Text>}
              {row.chevron && <Image systemName="chevron.right" size={12} color={colors.textSecondary} modifiers={[accessibilityHidden()]} />}
            </>}
          </HStack>;
          return <Fragment key={row.key}>
            {index > 0 && <Divider modifiers={[padding({ leading: 16 })]} />}
            {row.onPress ? <Button onPress={() => { if (!row.disabled && !row.loading) row.onPress?.(); }} role={row.destructive ? 'destructive' : 'default'}
              modifiers={[buttonStyle('plain'), disabled(!!row.disabled || !!row.loading), accessibilityIdentifier(`settings-${row.key}`)]}>
              {content}
            </Button> : content}
          </Fragment>;
        })}
      </VStack>
    </Host>
  </View>;
}
