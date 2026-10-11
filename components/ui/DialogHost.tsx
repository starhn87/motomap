import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { PostHogMaskView } from 'posthog-react-native';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useDialogStore, type AppDialog, type DialogButton } from '@/lib/dialog';

// 앱 다이얼로그 렌더 — 루트에 1회 장착. 특보·전화 카드와 같은 팔레트 카드에
// 버튼을 세로로 쌓는다. 위계는 iOS 관례대로: 취소는 맨 아래, 본 행동 중
// 첫 번째(파괴적이지 않은 것)만 채운 버튼으로 강조한다.
export default function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog);
  const hide = useDialogStore((s) => s.hide);
  if (!dialog) return null;

  const press = (button: DialogButton | undefined) => {
    // 다음 확인창을 여는 액션을 위해 현재 창부터 닫는다.
    if (dialog.dismissible !== false) hide();
    button?.onPress?.();
  };

  const dismiss = () => {
    if (dialog.dismissible !== false) press(dialog.buttons.find((b) => b.style === 'cancel'));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <DialogCard dialog={dialog} onPress={press} onDismiss={dismiss} />
    </Modal>
  );
}

// 이미 열린 검색 모달 안에서도 같은 카드를 사용한다. 네이티브 Modal을 중첩하지 않는다.
export function DialogCard({ dialog, onPress, onDismiss }: {
  dialog: AppDialog;
  onPress: (button: DialogButton | undefined) => void;
  onDismiss: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // 취소는 항상 맨 아래 — 시스템 Alert 은 배열 위치가 제각각이라 여기서 정렬
  const sorted = [
    ...dialog.buttons.filter((b) => b.style !== 'cancel'),
    ...dialog.buttons.filter((b) => b.style === 'cancel'),
  ];
  const primaryIndex = sorted.findIndex((b) => !b.style || b.style === 'default');

  const MessageWrap = dialog.maskMessage ? PostHogMaskView : View;

  return (
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* 카드 자체 탭은 닫히지 않게 — 내부 Pressable 이 이벤트를 삼킨다 */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          onPress={() => {}}>
          <Text style={[styles.title, { color: colors.text }]}>{dialog.title}</Text>
          {!!dialog.message && (
            <MessageWrap>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {dialog.message}
              </Text>
            </MessageWrap>
          )}

          <View style={styles.buttons}>
            {sorted.map((b, i) => {
              const isPrimary = i === primaryIndex;
              const labelColor =
                b.style === 'destructive'
                  ? semantic.danger
                  : b.style === 'cancel'
                    ? colors.textSecondary
                    : colors.text;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => onPress(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    isPrimary
                      ? { backgroundColor: colors.tint }
                      : { borderWidth: 1, borderColor: colors.border },
                    pressed && { opacity: 0.75 },
                  ]}>
                  <Text
                    style={[
                      styles.buttonText,
                      { color: isPrimary ? colors.background : labelColor },
                      b.style === 'cancel' && styles.cancelText,
                    ]}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
  },
  buttons: {
    gap: 8,
    marginTop: 6,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelText: {
    fontWeight: '600',
  },
});
