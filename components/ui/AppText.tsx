import { forwardRef } from 'react';
import { Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { APP_FONT_STYLE } from '@/lib/typography';

// 크기·굵기·접근성 배율은 호출부와 OS가 결정하고 서체만 공통 적용한다.
export type Text = NativeText;
export const Text = forwardRef<NativeText, TextProps>((props, ref) =>
  <NativeText {...props} ref={ref} style={[APP_FONT_STYLE, props.style]} />);
Text.displayName = 'AppText';

export type TextInput = NativeTextInput;
export const TextInput = forwardRef<NativeTextInput, TextInputProps>((props, ref) =>
  <NativeTextInput {...props} ref={ref} style={[APP_FONT_STYLE, props.style]} />);
TextInput.displayName = 'AppTextInput';
