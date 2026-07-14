import { BaseToast } from 'react-native-toast-message';
import type { ToastConfig } from 'react-native-toast-message';

// 라이브러리 기본 폰트(제목 15/본문 12)가 작아서 안내가 잘 안 읽힘 —
// 크기를 키우고, 본문 두 줄이 잘리지 않게 높이를 내용에 맞춘다.
// 타입별 좌측 색상은 라이브러리 기본 팔레트를 그대로 유지.
const container = { height: undefined, minHeight: 60, paddingVertical: 10 } as const;
const text1Style = { fontSize: 16, fontWeight: '700' } as const;
const text2Style = { fontSize: 14, lineHeight: 19 } as const;

function styledToast(borderLeftColor: string): ToastConfig[string] {
  return (props) => (
    <BaseToast
      {...props}
      style={[container, { borderLeftColor }]}
      text1Style={text1Style}
      text2Style={text2Style}
      text1NumberOfLines={2}
      text2NumberOfLines={2}
    />
  );
}

export const toastConfig: ToastConfig = {
  success: styledToast('#69C779'),
  error: styledToast('#FE6301'),
  info: styledToast('#87CEFA'),
};
