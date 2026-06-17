import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  formatDistance,
  formatRideDuration,
  formatSpeed,
} from '@/constants/course';
import type { RideSummary } from '@/stores/useRideStore';

interface Props {
  summary: RideSummary | null;
  title: string;
  onChangeTitle: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}

export default function RideSummaryModal({
  summary,
  title,
  onChangeTitle,
  onSave,
  onDiscard,
  saving,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const stats = summary
    ? [
        { value: formatDistance(summary.distanceKm), label: '거리' },
        { value: formatRideDuration(summary.durationSec), label: '시간' },
        { value: formatSpeed(summary.avgSpeed), label: '평균' },
        { value: formatSpeed(summary.maxSpeed), label: '최고' },
      ]
    : [];

  return (
    <Modal
      visible={!!summary}
      transparent
      animationType="slide"
      onRequestClose={onDiscard}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.title, { color: colors.text }]}>주행 완료</Text>

          {stats.length > 0 && (
            <View style={styles.grid}>
              {stats.map((s) => (
                <View key={s.label} style={styles.cell}>
                  <Text style={[styles.cellValue, { color: colors.text }]}>
                    {s.value}
                  </Text>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TextInput
            style={[
              styles.titleInput,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={title}
            onChangeText={onChangeTitle}
            placeholder="주행 제목"
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.buttons}>
            <Pressable
              onPress={onDiscard}
              style={[styles.btn, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.btnText, { color: colors.text }]}>삭제</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={[
                styles.btn,
                { backgroundColor: colors.tint, opacity: saving ? 0.6 : 1 },
              ]}>
              <Text style={[styles.btnText, { color: colors.background }]}>
                {saving ? '저장 중...' : '저장'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  cell: { width: '50%', alignItems: 'center', paddingVertical: 10 },
  cellValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  cellLabel: { fontSize: 12 },
  titleInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
});
