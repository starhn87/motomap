import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

import BikeIcon from '@/components/ui/BikeIcon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useMyRideStats } from '@/hooks/usePlaceRides';
import { useUserBikes } from '@/hooks/useUserBikes';
import { track } from '@/lib/analytics';
import { useMyBike } from '@/lib/bike';
import Skeleton from '@/components/ui/Skeleton';

/** 프로필의 정체성 카드 — 등록과 기록을 한 자리에서 보여준다. */
export default function MyBikeHero() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { model, spec, isLoading } = useMyBike();
  const { data: garage, isLoading: garageLoading } = useUserBikes();
  const rides = useMyRideStats();
  const activeBike = garage?.find((bike) => bike.isActive);
  const displayModel = activeBike?.model ?? model;

  if (isLoading || garageLoading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headingRow}>
          <Skeleton width={88} height={88} radius={18} />
          <View style={styles.titleBody}>
            <Skeleton width={72} height={11} />
            <Skeleton width="75%" height={24} style={{ marginTop: 7 }} />
          </View>
          <Skeleton width={36} height={36} radius={18} />
        </View>
        <View style={styles.specs}>
          <Skeleton width={72} height={18} radius={4} />
          <Skeleton width={96} height={18} radius={4} />
          <Skeleton width={54} height={18} radius={4} />
          <Skeleton width={72} height={18} radius={4} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.passportRow}>
          <View>
            <Skeleton width={86} height={12} />
            <Skeleton width={150} height={16} style={{ marginTop: 7 }} />
          </View>
        </View>
      </View>
    );
  }

  if (!displayModel) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.background }]}>
          <BikeIcon size={36} color={colors.tint} />
        </View>
        <View style={styles.emptyBody}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>내 바이크</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>등록된 바이크가 없어요</Text>
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

  const details = [
    activeBike?.modelYear ? `${activeBike.modelYear}년식` : null,
    activeBike?.color,
    spec?.cc ? `${spec.cc}cc` : null,
    spec?.category,
    spec?.electric ? '전기' : spec?.fuelGrade === 'premium' ? '고급휘발유' : spec?.fuelGrade ? '일반휘발유' : null,
  ].filter((value): value is string => !!value);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.iconCircle, { backgroundColor: colors.background }]}>
          {activeBike?.photoUrl ? (
            <Image source={{ uri: activeBike.photoUrl }} style={styles.bikeImage} contentFit="cover" />
          ) : (
            <BikeIcon size={48} color={colors.tint} />
          )}
        </View>
        <View style={styles.titleBody}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>내 바이크{garage?.length ? ` ${garage.length}대` : ''}</Text>
          <Text style={[styles.model, { color: colors.text }]} numberOfLines={2}>
            {activeBike?.nickname || displayModel}
          </Text>
          {!!activeBike?.nickname && (
            <Text style={[styles.modelDetail, { color: colors.textSecondary }]} numberOfLines={1}>
              {displayModel}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityLabel="내 바이크 편집"
          hitSlop={10}
          onPress={() => router.push('/edit-bike')}
          style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.5 }]}>
          <MaterialCommunityIcons name="pencil" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {details.length > 0 && (
        <View style={styles.specs}>
          {details.map((detail, index) => (
            <Text key={`${index}-${detail}`} style={[styles.specText, { color: colors.textSecondary }]}>{detail}</Text>
          ))}
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
          <Text style={[styles.passportLabel, { color: colors.textSecondary }]}>나의 주행 기록</Text>
          {rides.rides > 0 ? (
            <View style={styles.rideSummary}>
              <Text style={[styles.passportValue, { color: colors.text }]}>{rides.places}곳 방문</Text>
              <Text style={[styles.passportValue, { color: colors.text }]}>{rides.rides}번 주행</Text>
            </View>
          ) : (
            <Text style={[styles.passportValue, { color: colors.text }]}>기록 없음</Text>
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
    minHeight: 250,
    justifyContent: 'space-between',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bikeImage: {
    width: '100%',
    height: '100%',
  },
  titleBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  model: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  modelDetail: {
    fontSize: 12.5,
  },
  editButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    minHeight: 40,
  },
  specText: {
    fontSize: 12,
    lineHeight: 18,
  },
  rideSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
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
