import { View, Text, Pressable, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDistance, formatRideDuration } from '@/constants/course';
import type { RideSnapshot } from '@/lib/ridePersist';

// 강제 종료/크래시로 중단된 주행을 저장하거나 버리도록 안내하는 배너.
export default function RecoveredRideBanner({
  snapshot,
  onSave,
  onDiscard,
  saving,
}: {
  snapshot: RideSnapshot;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <View style={styles.info}>
        <FontAwesome name="exclamation-circle" size={18} color="#F59E0B" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            중단된 주행이 있어요
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {formatDistance(snapshot.distanceM / 1000)} ·{' '}
            {formatRideDuration(snapshot.durationSec)}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onDiscard}
          disabled={saving}
          style={[styles.btn, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.btnText, { color: colors.text }]}>삭제</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.btn, { backgroundColor: colors.tint, opacity: saving ? 0.6 : 1 }]}>
          <Text style={[styles.btnText, { color: colors.background }]}>
            {saving ? '저장 중…' : '저장'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '700' },
});
