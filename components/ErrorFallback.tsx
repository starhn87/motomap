import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

/** 오류 원문·스택은 화면에 올리지 않는다. 전송 여부와 별개로 사용자 입력일 수 있다. */
export function ErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>화면을 열지 못했습니다. 다시 시도해 주세요.</Text>
      <Pressable accessibilityRole="button" onPress={resetError} style={styles.action}>
        <Text style={styles.actionLabel}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', padding: 28 },
  title: { color: '#F5F5F2', fontSize: 18, lineHeight: 28 },
  action: { paddingVertical: 18 },
  actionLabel: { color: '#F5F5F2', fontSize: 16 },
});
