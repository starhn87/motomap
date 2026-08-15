import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import BikeIcon from '@/components/ui/BikeIcon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useMyRideStats } from '@/hooks/usePlaceRides';
import { track } from '@/lib/analytics';
import { useMyBike } from '@/lib/bike';

function SpecChip({ label }: { label: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.chip, { backgroundColor: colors.background }]}>
      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** 프로필의 정체성 카드 — 등록과 기록을 한 자리에서 보여준다. */
export default function MyBikeHero() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { model, spec, isLoading } = useMyBike();
  const rides = useMyRideStats();

  if (isLoading) {
    return (
      <View style={[styles.card, styles.loading, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  if (!model) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.background }]}>
          <BikeIcon size={36} color={colors.tint} />
        </View>
        <View style={styles.emptyBody}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>MY BIKE</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>내 라이더 프로필을 완성해보세요</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>기종을 등록하면 리뷰와 라이딩 기록에 내 바이크의 이야기가 쌓여요.</Text>
        </View>
        <Pressable
          onPress={() => router.push('/edit-bike')}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Text style={[styles.primaryButtonText, { color: colors.background }]}>내 바이크 등록</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.background} />
        </Pressable>
      </View>
    );
  }

  const chips = [
    spec?.cc ? `${spec.cc}cc` : null,
    spec?.category,
    spec?.electric ? '전기' : spec?.fuelGrade === 'premium' ? '고급휘발유' : spec?.fuelGrade ? '일반휘발유' : null,
  ].filter((value): value is string => !!value);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.iconCircle, { backgroundColor: colors.background }]}>
          <BikeIcon size={38} color={colors.tint} />
        </View>
        <View style={styles.titleBody}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>MY BIKE</Text>
          <Text style={[styles.model, { color: colors.text }]} numberOfLines={2}>{model}</Text>
        </View>
        <Pressable
          accessibilityLabel="내 바이크 편집"
          hitSlop={10}
          onPress={() => router.push('/edit-bike')}
          style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.5 }]}>
          <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip) => <SpecChip key={chip} label={chip} />)}
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable
        disabled={rides.rides === 0}
        onPress={() => {
          track.bikeRideHistoryOpened({ source: 'bike_hero' });
          router.push('/my-rides');
        }}
        style={({ pressed }) => [styles.passportRow, pressed && { opacity: 0.65 }]}>
        <View>
          <Text style={[styles.passportLabel, { color: colors.textSecondary }]}>라이딩 패스포트</Text>
          {rides.rides > 0 ? (
            <Text style={[styles.passportValue, { color: colors.text }]}>
              {rides.places}곳 · {rides.rides}번 라이딩
            </Text>
          ) : (
            <Text style={[styles.passportValue, { color: colors.text }]}>첫 라이딩을 기다리고 있어요</Text>
          )}
        </View>
        {rides.rides > 0 && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 18,
    borderWidth: 1,
    borderRadius: 20,
    gap: 14,
  },
  loading: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBody: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  model: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
  },
  editButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  passportRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passportLabel: {
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  passportValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyBody: {
    gap: 5,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
