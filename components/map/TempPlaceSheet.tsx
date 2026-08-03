import { View, Text, Pressable, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { openNavigation, useNavLaunching } from '@/lib/navigation';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { useIsGeneralFavorite, useToggleGeneralFavorite } from '@/hooks/useFavorites';
import { useGasPricesAt } from '@/hooks/useGasStations';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import { poiSourceKey } from '@/lib/api/placeHours';
import OpenBadge from '@/components/place/OpenBadge';
import { FUEL_LABELS, formatTradeAt } from '@/lib/api/gasStations';

export interface TempPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** 전화번호 (카카오 로컬에서 온 경우만, 없으면 미표시) */
  phone?: string;
}

interface Props {
  place: TempPlace;
  onClose: () => void;
}

// 검색의 "일반 장소"(카카오 로컬 결과)를 골랐을 때 뜨는 경량 카드 — DB 장소가
// 아니므로 리뷰는 없지만, 라이더 특화 장소가 아니어도 자주 가는 곳은 있으니
// 즐겨찾기는 된다(migration 032). 길안내와 제보 진입도 함께 제공한다.
export default function TempPlaceSheet({ place, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navLaunching = useNavLaunching((s) => s.launching);
  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
  const user = useAuthStore((st) => st.user);
  const isFavorite = useIsGeneralFavorite(place);
  const { mutateAsync: toggleFavorite, isPending: favPending } = useToggleGeneralFavorite();
  // 주유소면 카테고리 필터를 켜지 않았어도 유가를 보여준다 — 즐겨찾기로 들어온
  // 단골 주유소도 이 카드로 오기 때문에 여기 한 곳이면 두 경로가 다 걸린다.
  const { data: gas, isLoading: gasLoading } = useGasPricesAt(place);
  // 우리 DB 에 없는 장소라 영업시간은 구글에서 온다
  const { data: placeHours } = usePlaceHours({
    sourceKey: poiSourceKey(place.latitude, place.longitude),
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  });
  const fuelPrices = (gas?.prices ?? []).filter((p) => p.prod in FUEL_LABELS);

  const handleFavorite = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    try {
      await toggleFavorite({
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        phone: place.phone,
      });
    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  // 이 장소가 이미 집/회사로 저장돼 있는지 (좌표 근사 일치)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  const savedSlot: MyPlaceSlot | null =
    myPlaces.home && near(myPlaces.home.latitude, place.latitude) && near(myPlaces.home.longitude, place.longitude)
      ? 'home'
      : myPlaces.work && near(myPlaces.work.latitude, place.latitude) && near(myPlaces.work.longitude, place.longitude)
        ? 'work'
        : null;

  const handleSaveMyPlace = () => {
    if (savedSlot) {
      const isHome = savedSlot === 'home';
      Alert.alert(isHome ? '집으로 저장된 장소' : '회사로 저장된 장소', place.name, [
        { text: '취소', style: 'cancel' },
        {
          text: isHome ? '회사로 변경' : '집으로 변경',
          onPress: async () => {
            await removeMyPlace(savedSlot);
            await saveMyPlace(isHome ? 'work' : 'home', place);
            toast.success(isHome ? '회사로 변경했어요.' : '집으로 변경했어요.');
          },
        },
        {
          text: '저장 해제',
          style: 'destructive',
          onPress: async () => {
            await removeMyPlace(savedSlot);
            toast.info('내 장소에서 해제했어요.');
          },
        },
      ]);
      return;
    }
    Alert.alert('내 장소로 저장', `${place.name}\n검색 화면에서 바로 길안내할 수 있어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '집으로',
        onPress: async () => {
          await saveMyPlace('home', place);
          toast.success('집으로 저장했어요.');
        },
      },
      {
        text: '회사로',
        onPress: async () => {
          await saveMyPlace('work', place);
          toast.success('회사로 저장했어요.');
        },
      },
    ]);
  };

  const handleNavigate = () => {
    void openNavigation({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    });
  };

  const handleSubmit = () => {
    onClose();
    router.navigate({
      pathname: '/submit',
      params: {
        prefillName: place.name,
        prefillAddress: place.address,
        prefillLat: String(place.latitude),
        prefillLng: String(place.longitude),
        prefillTs: String(Date.now()),
      },
    });
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>
            {place.address}
          </Text>
          <OpenBadge hours={placeHours?.hours} businessStatus={placeHours?.businessStatus} />
        </View>
        {!!place.phone && (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${place.phone}`)}
            hitSlop={8}
            style={styles.saveButton}>
            <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
        {/* 별은 즐겨찾기 전용. 집·회사 저장은 북마크로 갈라 둔다 — 예전엔 둘 다
            별이라 "즐겨찾기하려는데 집/회사를 고르라 한다"는 오해가 있었다. */}
        <Pressable
          onPress={handleFavorite}
          disabled={favPending}
          hitSlop={8}
          style={styles.saveButton}>
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={isFavorite ? '#FACC15' : colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={handleSaveMyPlace} hitSlop={8} style={styles.saveButton}>
          <Ionicons
            name={
              savedSlot === 'home' ? 'home' : savedSlot === 'work' ? 'business' : 'bookmark-outline'
            }
            size={20}
            color={savedSlot ? colors.tint : colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* 주유소로 보이면 값이 오기 전에 자리를 잡아 둔다. 유종이 2개인 곳도 있어
          minHeight 로 높이를 고정해야 줄 수가 달라도 카드가 안 흔들린다. */}
      {(gasLoading || fuelPrices.length > 0) && (
        <View style={styles.priceRows}>
          {gasLoading
            ? [0, 1, 2].map((i) => (
                <View key={i} style={styles.priceRow}>
                  <View
                    style={[styles.skeleton, { width: 56, backgroundColor: colors.surfaceMuted }]}
                  />
                  <View
                    style={[styles.skeleton, { width: 80, backgroundColor: colors.surfaceMuted }]}
                  />
                </View>
              ))
            : fuelPrices.map((p) => (
                <View key={p.prod} style={styles.priceRow}>
                  <Text style={[styles.fuelLabel, { color: colors.textSecondary }]}>
                    {FUEL_LABELS[p.prod as keyof typeof FUEL_LABELS]}
                  </Text>
                  <Text style={[styles.fuelPrice, { color: colors.text }]}>
                    {p.price.toLocaleString()}원
                  </Text>
                </View>
              ))}
          <Text style={[styles.tradeAt, { color: colors.textSecondary }]}>
            {gasLoading ? '' : formatTradeAt(fuelPrices[0].tradeAt)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          disabled={navLaunching}
          onPress={handleNavigate}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.tint, opacity: pressed || navLaunching ? 0.85 : 1 },
          ]}>
          {navLaunching ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[styles.actionText, { color: colors.background }]}>길안내 시작</Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.actionText, { color: colors.text }]}>이곳 제보하기</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  address: {
    fontSize: 13,
  },
  saveButton: {
    padding: 2,
    marginRight: 10,
  },
  closeButton: {
    padding: 2,
  },
  priceRows: {
    gap: 6,
    marginTop: 14,
    // 3줄(20) + gap(6×3) + 기준 시각(14). 유종이 2개여도 이 높이를 지킨다
    minHeight: 92,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // 스켈레톤과 실제 텍스트의 높이를 같게 못 박는다 (아래 lineHeight 와 한 쌍)
    height: 20,
  },
  fuelLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  fuelPrice: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  skeleton: {
    height: 14,
    borderRadius: 7,
  },
  tradeAt: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
