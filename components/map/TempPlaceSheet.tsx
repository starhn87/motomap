import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation, useNavLaunching } from '@/lib/navigation';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { toast } from '@/lib/toast';
import { appAlert } from '@/lib/dialog';
import { useAuthStore } from '@/stores/useAuthStore';
import { useIsGeneralFavorite, useToggleGeneralFavorite } from '@/hooks/useFavorites';
import { useGasPricesAt } from '@/hooks/useGasStations';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import { poiSourceKey } from '@/lib/api/placeHours';
import PlaceHoursBlock from '@/components/place/PlaceHoursBlock';
import OpenBadge from '@/components/place/OpenBadge';
import { formatWeek } from '@/lib/hours';
import { FUEL_LABELS, formatTradeAt, looksLikeGasStation } from '@/lib/api/gasStations';
import { fullTankCost, myFuelProd, useMyBike } from '@/lib/bike';
import { haptics } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import {
  ensureGeneralPlace,
  generalPlaceIdentity,
  type GeneralPlaceInput,
} from '@/lib/api/generalPlaces';
import { useGeneralPlace } from '@/hooks/useGeneralPlace';
import ReviewForm from '@/components/review/ReviewForm';
import ReviewList from '@/components/review/ReviewList';

export interface TempPlace extends GeneralPlaceInput {
  /** 이미 DB에 연결된 일반 장소로 들어온 경우 */
  generalPlaceId?: string;
}

interface Props {
  place: TempPlace;
  onClose: () => void;
}

const SNAP_POINTS = [100, '45%', '100%'];

// 일반 장소도 등록 장소와 같은 확장형 상세 경험을 쓴다. 차이는 카테고리·라이더
// 집계처럼 모토맵이 검증한 정보 대신 카카오 정보와 라이더 리뷰가 중심이라는 점이다.
export default function TempPlaceSheet({ place, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollRef = useRef<any>(null);
  const didInitRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(1);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [resolvingNavigation, setResolvingNavigation] = useState(false);
  const isExpanded = currentIndex === SNAP_POINTS.length - 1;
  const navLaunching = useNavLaunching((s) => s.launching);
  const user = useAuthStore((st) => st.user);

  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
  const isFavorite = useIsGeneralFavorite(place);
  const { mutateAsync: toggleFavorite, isPending: favPending } =
    useToggleGeneralFavorite();
  const { data: generalPlace } = useGeneralPlace(place);
  const generalPlaceId = generalPlace?.id ?? place.generalPlaceId;
  const reviewTarget = generalPlaceId
    ? ({ kind: 'general', id: generalPlaceId } as const)
    : null;

  const { data: gas, isLoading: gasLoading } = useGasPricesAt(place);
  const canLoadHours = !looksLikeGasStation(place.name);
  const { data: placeHours } = usePlaceHours(
    canLoadHours
      ? {
          sourceKey: poiSourceKey(place.latitude, place.longitude),
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        }
      : null,
  );
  const hasHoursDetails = formatWeek(placeHours?.hours ?? {}).length > 0;
  const fuelPrices = (gas?.prices ?? []).filter((p) => p.prod in FUEL_LABELS);
  const { spec: myBike } = useMyBike();
  const myProd = myFuelProd(myBike);
  const tankCost = fullTankCost(myBike, fuelPrices);

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  useEffect(() => {
    setHoursExpanded(false);
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    bottomSheetRef.current?.snapToIndex(1);
  }, [place.name, place.latitude, place.longitude]);

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  const savedSlot: MyPlaceSlot | null =
    myPlaces.home &&
    near(myPlaces.home.latitude, place.latitude) &&
    near(myPlaces.home.longitude, place.longitude)
      ? 'home'
      : myPlaces.work &&
          near(myPlaces.work.latitude, place.latitude) &&
          near(myPlaces.work.longitude, place.longitude)
        ? 'work'
        : null;

  const handleFavorite = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    try {
      await toggleFavorite(place);
      haptics.selection();
    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

  const handleSaveMyPlace = () => {
    if (savedSlot) {
      const isHome = savedSlot === 'home';
      appAlert(isHome ? '집으로 저장된 장소' : '회사로 저장된 장소', place.name, [
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
    appAlert('내 장소로 저장', `${place.name}\n검색 화면에서 바로 길안내할 수 있어요.`, [
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

  const handleNavigate = async () => {
    if (resolvingNavigation || navLaunching) return;
    setResolvingNavigation(true);
    try {
      let resolved = generalPlace;
      if (!resolved && user) {
        try {
          resolved = await ensureGeneralPlace(place);
        } catch {
          // 기록 연결이 실패해도 길안내 자체는 계속한다.
        }
      }
      await openNavigation({
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        ...(resolved?.promotedPlaceId
          ? { placeId: resolved.promotedPlaceId }
          : resolved?.id || place.generalPlaceId
            ? { generalPlaceId: resolved?.id ?? place.generalPlaceId }
            : {}),
      });
    } finally {
      setResolvingNavigation(false);
    }
  };

  const handleShare = async () => {
    const link = place.placeUrl ? `\n${place.placeUrl}` : '';
    try {
      await Share.share({ message: `${place.name}\n${place.address}${link}` });
    } catch {
      // 공유 시트를 닫은 경우 등 — 무시
    }
  };

  const handleSubmit = () => {
    const identity = generalPlace
      ? { provider: generalPlace.provider, providerId: generalPlace.providerId }
      : generalPlaceIdentity(place);
    onClose();
    track.placeSubmissionOpened({ source: 'temp_place' });
    router.navigate({
      pathname: '/submit',
      params: {
        prefillName: place.name,
        prefillAddress: place.address,
        prefillLat: String(place.latitude),
        prefillLng: String(place.longitude),
        prefillPhone: place.phone ?? '',
        prefillProvider: identity.provider,
        prefillProviderId: identity.providerId,
        prefillSource: 'temp_place',
        prefillTs: String(Date.now()),
      },
    });
  };

  const headerActions = (
    <View style={styles.headerActions}>
      <Pressable onPress={handleFavorite} disabled={favPending} hitSlop={8}>
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={25}
          color={isFavorite ? semantic.star : colors.textSecondary}
        />
      </Pressable>
      <Pressable onPress={handleSaveMyPlace} hitSlop={8}>
        <Ionicons
          name={
            savedSlot === 'home'
              ? 'home'
              : savedSlot === 'work'
                ? 'business'
                : 'bookmark-outline'
          }
          size={23}
          color={savedSlot ? colors.tint : colors.textSecondary}
        />
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={25} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  const navigating = resolvingNavigation || navLaunching;

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        animateOnMount={false}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture
        onChange={(index) => {
          setCurrentIndex(index);
          if (index === -1) onClose();
        }}
        containerStyle={styles.sheetContainer}
        backgroundStyle={{
          backgroundColor: colors.background,
          borderRadius: isExpanded ? 0 : 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }}>
        <BottomSheetScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {isExpanded && <View style={{ height: insets.top + 44 }} />}

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {place.name}
            </Text>
            {!isExpanded && headerActions}
          </View>

          <View style={styles.addressRow}>
            <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>
              {place.address}
            </Text>
            <View style={[styles.generalBadge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.generalBadgeText, { color: colors.textSecondary }]}>일반</Text>
            </View>
            <Pressable onPress={handleShare} hitSlop={8}>
              <Feather name="share-2" size={19} color={colors.tint} />
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/directions',
                  params: {
                    olng: String(place.longitude),
                    olat: String(place.latitude),
                    oname: place.name,
                  },
                })
              }
              style={[styles.actionButton, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.departText, { color: colors.text }]}>출발</Text>
            </Pressable>
            <Pressable
              disabled={navigating}
              onPress={handleNavigate}
              style={[
                styles.actionButton,
                { backgroundColor: colors.tint, opacity: navigating ? 0.8 : 1 },
              ]}>
              {navigating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={[styles.arriveText, { color: colors.background }]}>도착</Text>
              )}
            </Pressable>
            <View style={styles.openStatusSlot}>
              {canLoadHours && (
                <OpenBadge
                  hours={placeHours?.hours}
                  businessStatus={placeHours?.businessStatus}
                  inline
                />
              )}
            </View>
          </View>

          {canLoadHours && hasHoursDetails && (
            <View style={styles.hoursBlock}>
              <Pressable
                onPress={() => setHoursExpanded((expanded) => !expanded)}
                style={styles.hoursToggle}>
                <Text style={[styles.hoursToggleText, { color: colors.tint }]}>영업시간</Text>
                <Text style={[styles.hoursToggleText, { color: colors.tint }]}>
                  {hoursExpanded ? '접기' : '펼치기'}
                </Text>
              </Pressable>
              {hoursExpanded && (
                <PlaceHoursBlock
                  hours={placeHours?.hours}
                  businessStatus={placeHours?.businessStatus}
                  showStatus={false}
                />
              )}
            </View>
          )}

          {(gasLoading || fuelPrices.length > 0) && (
            <View style={[styles.priceRows, { borderColor: colors.border }]}>
              {gasLoading
                ? [0, 1, 2].map((i) => (
                    <View key={i} style={styles.priceRow}>
                      <View
                        style={[
                          styles.skeleton,
                          { width: 56, backgroundColor: colors.surfaceMuted },
                        ]}
                      />
                      <View
                        style={[
                          styles.skeleton,
                          { width: 80, backgroundColor: colors.surfaceMuted },
                        ]}
                      />
                    </View>
                  ))
                : fuelPrices.map((price) => {
                    const mine = price.prod === myProd;
                    return (
                      <View key={price.prod} style={styles.priceRow}>
                        <Text
                          style={[
                            styles.fuelLabel,
                            { color: mine ? colors.tint : colors.textSecondary },
                            mine && styles.fuelMine,
                          ]}>
                          {FUEL_LABELS[price.prod as keyof typeof FUEL_LABELS]}
                          {mine ? ' (내 바이크)' : ''}
                        </Text>
                        <Text
                          style={[
                            styles.fuelPrice,
                            { color: mine ? colors.tint : colors.text },
                          ]}>
                          {price.price.toLocaleString()}원
                        </Text>
                      </View>
                    );
                  })}
              <Text style={[styles.tradeAt, { color: colors.textSecondary }]}>
                {gasLoading
                  ? ''
                  : [
                      tankCost
                        ? `가득 약 ${tankCost.toLocaleString()}원 (${myBike!.tankL}L)`
                        : null,
                      formatTradeAt(fuelPrices[0].tradeAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </Text>
            </View>
          )}

          {!!place.phone && (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${place.phone}`)}
              style={[
                styles.infoCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Ionicons name="call-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>{place.phone}</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSubmit}
            style={[styles.submitCard, { borderColor: colors.border }]}>
            <View style={styles.submitCopy}>
              <Text style={[styles.submitTitle, { color: colors.text }]}>라이더 정보 추가</Text>
              <Text style={[styles.submitDescription, { color: colors.textSecondary }]}>
                주차·영업 정보 등을 알려주면 모토맵 장소로 검토해요.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tint} />
          </Pressable>

          <View style={[styles.reviewSection, { borderTopColor: colors.border }]}>
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewTitle, { color: colors.text }]}>라이더 리뷰</Text>
              {(generalPlace?.rating ?? 0) > 0 && (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {generalPlace!.rating}
                  </Text>
                  <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>
                    ({generalPlace!.reviewCount})
                  </Text>
                </View>
              )}
            </View>
            <ReviewForm target={{ kind: 'general', place }} />
            <View style={[styles.reviewDivider, { backgroundColor: colors.border }]} />
            {reviewTarget ? (
              <ReviewList target={reviewTarget} />
            ) : (
              <Text style={[styles.emptyReviews, { color: colors.textSecondary }]}>
                아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요!
              </Text>
            )}
          </View>

          <Text style={[styles.attribution, { color: colors.textSecondary }]}>장소 정보 제공: 카카오</Text>
        </BottomSheetScrollView>
      </BottomSheet>

      {isExpanded && (
        <View
          style={[
            styles.pageHeader,
            { paddingTop: insets.top, backgroundColor: colors.background },
          ]}>
          <Pressable onPress={() => bottomSheetRef.current?.snapToIndex(1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={25} color={colors.text} />
          </Pressable>
          {headerActions}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheetContainer: { zIndex: 20 },
  content: { padding: 20, paddingBottom: 120 },
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  address: { flex: 1, fontSize: 13, lineHeight: 18 },
  generalBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  generalBadgeText: { fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  actionButton: {
    minWidth: 74,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  departText: { fontSize: 14, fontWeight: '700' },
  arriveText: { fontSize: 14, fontWeight: '800' },
  openStatusSlot: {
    flex: 1,
    minWidth: 92,
    height: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  hoursBlock: { marginTop: 14 },
  hoursToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  hoursToggleText: { fontSize: 13, fontWeight: '700' },
  priceRows: {
    gap: 6,
    minHeight: 108,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  priceRow: { height: 20, flexDirection: 'row', justifyContent: 'space-between' },
  fuelLabel: { fontSize: 14, lineHeight: 20 },
  fuelPrice: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  fuelMine: { fontWeight: '700' },
  skeleton: { height: 14, borderRadius: 7 },
  tradeAt: { fontSize: 11, lineHeight: 14, textAlign: 'right' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  infoText: { fontSize: 14, fontWeight: '600' },
  submitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  submitCopy: { flex: 1, gap: 3 },
  submitTitle: { fontSize: 14, fontWeight: '800' },
  submitDescription: { fontSize: 12, lineHeight: 17 },
  reviewSection: { marginTop: 24, paddingTop: 22, borderTopWidth: 1 },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  reviewTitle: { fontSize: 18, fontWeight: '800' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { color: semantic.star, fontSize: 14 },
  ratingText: { fontSize: 14, fontWeight: '700' },
  reviewCount: { fontSize: 13 },
  reviewDivider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  emptyReviews: { fontSize: 13, textAlign: 'center', marginVertical: 16 },
  attribution: { marginTop: 28, fontSize: 11, textAlign: 'center' },
});
