import { View, Text, StyleSheet, Modal, Pressable, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 전화 확인 — 시스템 Alert 는 버튼이 가로로 붙어 비좁다(사용자 피드백).
// 특보 모달과 같은 앱 팔레트 카드로, 버튼을 세로로 쌓는다. 통화 직전의
// 시스템 확인(iOS 공통)은 그대로 한 번 더 뜬다.
export default function CallModal({
  name,
  phone,
  onClose,
}: {
  /** 장소명 — 어디로 거는지 확인용 */
  name: string;
  phone: string;
  onClose: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* 카드 자체 탭은 닫히지 않게 — 내부 Pressable 이 이벤트를 삼킨다 */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          onPress={() => {}}>
          <View style={styles.titleRow}>
            <Ionicons name="call-outline" size={17} color={colors.tint} />
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={[styles.phone, { color: colors.text }]}>{phone}</Text>

          <View style={styles.buttons}>
            <Pressable
              onPress={() => {
                Linking.openURL(`tel:${phone}`).catch(() => {});
                onClose();
              }}
              style={({ pressed }) => [
                styles.callButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Text style={[styles.callText, { color: colors.background }]}>전화 걸기</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  phone: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  buttons: {
    gap: 8,
  },
  callButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  callText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
