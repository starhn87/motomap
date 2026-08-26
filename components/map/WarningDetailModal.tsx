import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { WARNING_RIDER_TIPS, type WeatherWarning } from '@/lib/api/weather';

// 특보 상세 — 날씨 시트의 특보 칩을 탭하면 뜨는 카드 모달.
// 네이티브 Alert 는 앱 톤과 겉돌아서(사용자 피드백) 팔레트를 따르는 카드로 그린다.
// 발효 특보 전체와 특보별 라이딩 유의사항을 보여준다.
export default function WarningDetailModal({
  warnings,
  onClose,
}: {
  warnings: WeatherWarning[];
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
            <Ionicons name="warning-outline" size={17} color={semantic.warning} />
            <Text style={[styles.title, { color: colors.text }]}>발효 중인 기상특보</Text>
          </View>

          <View style={styles.list}>
            {warnings.map((w) => {
              const c = w.level === '경보' ? semantic.danger : semantic.warning;
              const tip = WARNING_RIDER_TIPS[w.type];
              return (
                <View key={w.type + w.level} style={styles.item}>
                  <View style={styles.itemHead}>
                    <View style={[styles.levelBadge, { backgroundColor: c + '1A' }]}>
                      <Text style={[styles.levelText, { color: c }]}>{w.level}</Text>
                    </View>
                    <Text style={[styles.typeText, { color: colors.text }]}>{w.type}</Text>
                  </View>
                  {!!tip && (
                    <Text style={[styles.tip, { color: colors.textSecondary }]}>{tip}</Text>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={[styles.source, { color: colors.textSecondary }]}>기상청 기상특보 기준</Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[styles.closeText, { color: colors.background }]}>확인</Text>
          </Pressable>
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
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  list: {
    gap: 14,
  },
  item: {
    gap: 6,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '800',
  },
  typeText: {
    fontSize: 15,
    fontWeight: '700',
  },
  tip: {
    fontSize: 13,
    lineHeight: 19,
  },
  source: {
    fontSize: 11,
  },
  closeButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
