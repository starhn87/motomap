import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { RIDER_FACTS, type RiderFactCode } from '@/constants/riderFacts';
import { useColorScheme } from '@/components/useColorScheme';
import { usePlaceRiderFacts, useTogglePlaceRiderFact } from '@/hooks/useRiderInsights';
import { usePlaceRideSummary } from '@/hooks/usePlaceRides';
import { track } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';

interface RiderPlaceFactsProps {
  placeId: string;
  onReportPlaceChange: () => void;
}

export default function RiderPlaceFacts({ placeId, onReportPlaceChange }: RiderPlaceFactsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((state) => state.user);
  const { data = [] } = usePlaceRiderFacts(placeId);
  const rides = usePlaceRideSummary(placeId);
  const toggle = useTogglePlaceRiderFact(placeId);

  const byCode = new Map(data.map((fact) => [fact.code, fact]));

  const handlePress = (code: RiderFactCode) => {
    if (!user) {
      toast.info('로그인하면 직접 확인한 정보를 남길 수 있어요.');
      return;
    }
    if (toggle.isPending) return;
    const current = byCode.get(code);
    track.riderFactToggled({ fact: code, on: !current?.confirmedByMe });
    toggle.mutate(code, {
      onError: (error) => toast.error('장소 정보를 반영하지 못했습니다.', error.message),
    });
  };

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>라이더 제공 정보</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>직접 확인한 항목을 눌러 알려주세요</Text>
      <View style={styles.facts}>
        {RIDER_FACTS.map((definition) => {
          const fact = byCode.get(definition.code);
          const selected = !!fact?.confirmedByMe;
          return (
            <Pressable
              key={definition.code}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={toggle.isPending}
              onPress={() => handlePress(definition.code)}
              style={({ pressed }) => [
                styles.fact,
                {
                  backgroundColor: selected ? colors.tint + '18' : colors.surfaceMuted,
                  borderColor: selected ? colors.tint : colors.border,
                  opacity: pressed || toggle.isPending ? 0.72 : 1,
                },
              ]}>
              <Ionicons
                name={definition.icon}
                size={15}
                color={selected ? colors.tint : colors.textSecondary}
              />
              <Text
                style={[
                  styles.factText,
                  { color: selected ? colors.tint : colors.text },
                ]}>
                {definition.label}
              </Text>
              <Text
                style={[
                  styles.count,
                  {
                    color: selected ? colors.tint : colors.textSecondary,
                    opacity: fact?.confirmations ? 1 : 0,
                  },
                ]}>
                {fact?.confirmations ?? 0}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {rides.total > 0 && (
        <View style={styles.rideBlock}>
          <Text style={[styles.rideCount, { color: colors.textSecondary }]}>
            🏍️ 라이더들이 {rides.total}번 달려온 곳이에요
          </Text>
          {rides.bikes.length > 0 && (
            <View style={styles.rideBikes}>
              {rides.bikes.map((bike) => (
                <View
                  key={bike.model}
                  style={[styles.rideBikeChip, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.rideBikeText, { color: colors.text }]}>
                    {bike.model}
                    {bike.riders > 1 ? ` ${bike.riders}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="장소 정보 제보"
        onPress={onReportPlaceChange}
        style={({ pressed }) => [
          styles.changeReportButton,
          { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
        ]}>
        <MaterialIcons name="outlined-flag" size={19} color={colors.textSecondary} />
        <View style={styles.changeReportCopy}>
          <Text style={[styles.changeReportTitle, { color: colors.text }]}>장소 정보 제보</Text>
          <Text style={[styles.changeReportDescription, { color: colors.textSecondary }]}>
            폐업·휴업·이전 또는 달라진 정보를 알려주세요.
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={21} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    paddingTop: 18,
    borderTopWidth: 1,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    marginBottom: 2,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  fact: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
  },
  factText: {
    fontSize: 12,
    fontWeight: '600',
  },
  count: {
    width: 18,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800',
  },
  rideBlock: {
    gap: 6,
    marginTop: 8,
  },
  rideCount: {
    fontSize: 13,
  },
  rideBikes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rideBikeChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 11,
  },
  rideBikeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  changeReportButton: {
    minHeight: 58,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  changeReportCopy: {
    flex: 1,
    gap: 2,
  },
  changeReportTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  changeReportDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
