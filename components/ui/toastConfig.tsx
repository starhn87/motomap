import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 라이브러리 기본 룩(흰 카드 + 좌측 색 막대)은 다크모드에서도 흰색으로 떠서 앱과
// 겉돈다 — 앱 팔레트를 따르는 카드(테마 대응 배경·보더·그림자)에 좌측 막대 대신
// 타입별 아이콘으로 그린다. 훅(useColorScheme)을 쓰므로 렌더 함수가 아니라
// 컴포넌트로 렌더한다.
const TYPE_STYLE = {
  success: { icon: 'checkmark-circle', color: semantic.success },
  error: { icon: 'alert-circle', color: semantic.danger },
  info: { icon: 'information-circle', color: '#3B82F6' },
} as const;

function MotoToast({ type, text1, text2 }: ToastConfigParams<unknown> & { type: keyof typeof TYPE_STYLE }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { icon, color } = TYPE_STYLE[type];
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          // 다크에선 그림자가 안 보여 보더가 윤곽을 맡는다 — 그림자는 라이트 전용
          shadowOpacity: colorScheme === 'dark' ? 0 : 0.1,
        },
      ]}>
      <Ionicons name={icon} size={22} color={color} style={styles.icon} />
      <View style={styles.texts}>
        {!!text1 && (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {text1}
          </Text>
        )}
        {!!text2 && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {text2}
          </Text>
        )}
      </View>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: (props) => <MotoToast {...props} type="success" />,
  error: (props) => <MotoToast {...props} type="error" />,
  info: (props) => <MotoToast {...props} type="info" />,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '92%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  icon: {
    alignSelf: 'flex-start',
    // 아이콘(22)과 제목 줄높이(20)의 광학 중앙을 맞춘다 — 두 줄일 땐 첫 줄에 붙는 게 자연스럽다
    marginTop: -1,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
});
