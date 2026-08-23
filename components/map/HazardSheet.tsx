import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { HAZARDS, hazardFreshness } from '@/constants/hazards';
import { useVoteHazard } from '@/hooks/useHazards';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from '@/lib/toast';
import type { RoadHazard } from '@/types';

interface Props {
  hazard: RoadHazard | null;
  onClose: () => void;
}

// 노면 위험 상세 — 지도 마커와 코스 상세 양쪽에서 같은 카드를 띄운다.
// 정보의 신뢰는 신선도에서 오므로 "언제 확인됐는지"와 투표 버튼을 함께 둔다.
export default function HazardSheet({ hazard, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { mutateAsync: vote, isPending } = useVoteHazard();
  // 토스트는 앱 루트에 렌더돼 이 모달에 가리므로, 실패는 카드 안에서 알린다
  const [error, setError] = useState<string | null>(null);

  if (!hazard) return null;
  const meta = HAZARDS[hazard.type];

  const handleVote = async (kind: 'confirm' | 'resolve') => {
    if (!user) {
      setError('로그인이 필요합니다.');
      return;
    }
    setError(null);
    try {
      await vote({ id: hazard.id, kind });
      onClose();
      // 모달이 닫힌 뒤에 알린다 — 토스트가 모달 뒤에 뜨는 것을 피한다
      setTimeout(() => {
        toast.success(
          kind === 'confirm' ? '확인 감사합니다. 정보가 갱신됐어요.' : '알려주셔서 감사합니다.'
        );
      }, 300);
    } catch (e: any) {
      setError(e.message ?? '처리에 실패했습니다.');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.card,
          {
            paddingBottom: insets.bottom + 20,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: `${meta.color}1A` }]}>
            <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
          </View>
          <View style={styles.headerBody}>
            <Text style={[styles.title, { color: colors.text }]}>{meta.label}</Text>
            <Text style={[styles.freshness, { color: colors.textSecondary }]}>
              {hazardFreshness(hazard.lastConfirmedAt, hazard.staleness)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="위험 정보 닫기"
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
            <MaterialIcons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {hazard.note ? (
          <Text style={[styles.note, { color: colors.text }]}>{hazard.note}</Text>
        ) : null}

        {hazard.address ? (
          <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={2}>
            {hazard.address}
          </Text>
        ) : null}

        {hazard.photo ? (
          <Image source={{ uri: hazard.photo }} style={styles.photo} contentFit="cover" />
        ) : null}

        {hazard.staleness > 0 && (
          <Text style={[styles.staleHint, { color: semantic.warning }]}>
            오래된 제보예요. 아직 그대로인지 알려주시면 다른 라이더에게 도움이 됩니다.
          </Text>
        )}

        {error ? (
          <Text style={[styles.error, { color: semantic.danger }]}>{error}</Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => void handleVote('confirm')}
            disabled={isPending}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: colors.tint,
                opacity: pressed || isPending ? 0.8 : 1,
              },
            ]}>
            {isPending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.actionText, { color: colors.background }]}>
                아직 있어요{hazard.confirmCount > 0 ? ` ${hazard.confirmCount}` : ''}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => void handleVote('resolve')}
            disabled={isPending}
            style={({ pressed }) => [
              styles.action,
              styles.secondary,
              { borderColor: colors.border, opacity: pressed || isPending ? 0.7 : 1 },
            ]}>
            <Text style={[styles.actionText, { color: colors.text }]}>
              없어졌어요{hazard.resolvedCount > 0 ? ` ${hazard.resolvedCount}` : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '700' },
  freshness: { fontSize: 13 },
  note: { fontSize: 15, lineHeight: 21 },
  address: { fontSize: 13 },
  photo: { width: '100%', height: 180, borderRadius: 12 },
  staleHint: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  actionText: { fontSize: 14, fontWeight: '700' },
});
