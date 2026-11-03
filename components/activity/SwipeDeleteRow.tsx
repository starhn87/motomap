import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { semantic } from '@/constants/Colors';
import { appAlert } from '@/lib/dialog';

type Props = { children: (confirmDelete: () => void) => ReactNode; label: string; message: string; onDelete: () => void; busy?: boolean };

/** 끝까지 밀어도 지우지 않는다. 드러난 버튼을 눌러 확인한 경우에만 실행한다. */
export default function SwipeDeleteRow({ children, label, message, onDelete, busy = false }: Props) {
  const ref = useRef<SwipeableMethods>(null);
  const confirm = () => {
    ref.current?.close();
    appAlert(label, message, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: onDelete },
    ]);
  };
  return <Swipeable ref={ref} enabled={!busy} friction={2} rightThreshold={40} overshootRight={false}
    renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy}
      onPress={confirm} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      <Text style={styles.label}>삭제</Text>
    </Pressable>} containerStyle={styles.container}>
    {children(() => { if (!busy) confirm(); })}
  </Swipeable>;
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, overflow: 'hidden' },
  action: { width: 80, backgroundColor: semantic.danger, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
