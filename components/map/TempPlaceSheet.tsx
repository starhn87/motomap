import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { TouchableOpacity } from 'react-native-gesture-handler';
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
import { useMapStore } from '@/stores/useMapStore';
import { useIsGeneralFavorite, useToggleGeneralFavorite } from '@/hooks/useFavorites';
import { useGasPricesAt } from '@/hooks/useGasStations';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import { poiSourceKey } from '@/lib/api/placeHours';
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
import { haversine } from '@/lib/distance';
import { formatMeters } from '@/lib/api/directions';

export interface TempPlace extends GeneralPlaceInput {
  /** 이미 DB에 연결된 일반 장소로 들어온 경우 */
  generalPlaceId?: string;
}

interface Props {
  place: TempPlace | null;
  onClose: () => void;
  animatedPosition?: SharedValue<number>;
}

const SNAP_POINTS = [100, '45%', '100%'];
const PAGE_HEADER_HEIGHT = 56;
const HANDLE_HEIGHT = 28;
const HEADER_CONTENT_GAP = 6;
const CONTENT_PADDING = 20;

// 일반 장소도 등록 장소와 같은 확장형 상세 경험을 쓴다. 차이는 카테고리·라이더
// 집계처럼 모토맵이 검증한 정보 대신 카카오 정보와 라이더 리뷰가 중심이라는 점이다.
export default function TempPlaceSheet({ place, onClose, animatedPosition }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollRef = useRef<any>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const animatedIndex = useSharedValue(-1);
  const currentIndexRef = useRef(-1);

  const syncIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
  }, []);

  useAnimatedReaction(
    () => Math.round(animatedIndex.value),
    (rounded, previous) => {
      if (rounded !== previous) runOnJS(syncIndex)(rounded);
    },
  );
  const [resolvingNavigation, setResolvingNavigation] = useState(false);
  const isExpanded = currentIndex === SNAP_POINTS.length - 1;
  const navLaunching = useNavLaunching((s) => s.launching);
  const user = useAuthStore((st) => st.user);
  const userLocation = useMapStore((s) => s.userLocation);

  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
  const isFavorite = useIsGeneralFavorite(place);
  const { mutateAsync: toggleFavorite, isPending: favPending } =
    useToggleGeneralFavorite();
  const { data: generalPlace } = useGeneralPlace(place);
  const generalPlaceId = generalPlace?.id ?? place?.generalPlaceId;
  const reviewTarget = generalPlaceId
    ? ({ kind: 'general', id: generalPlaceId } as const)
    : null;

  const { data: gas, isLoading: gasLoading } = useGasPricesAt(place);
  const canLoadHours = !!place && !looksLikeGasStation(place.name);
  const { data: placeHours } = usePlaceHours(
    place && canLoadHours
      ? {
          sourceKey: poiSourceKey(place.latitude, place.longitude),
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        }
      : null,
  );
  const weekLines = formatWeek(placeHours?.hours ?? {});
  const hoursText = [weekLines.join('\n'), placeHours?.hours?.note]
    .filter(Boolean)
    .join('\n');
  const fuelPrices = (gas?.prices ?? []).filter((p) => p.prod in FUEL_LABELS);
  const { spec: myBike } = useMyBike();
  const myProd = myFuelProd(myBike);
  const tankCost = fullTankCost(myBike, fuelPrices);

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  useEffect(() => {
    if (place) {
      // 시트 인스턴스는 닫힌 상태로 계속 유지하고, POI 선택 때만 연다.
      // 데이터와 시트를 함께 마운트하면 초기 index 적용과 snap 명령이 경합해
      // 열림 애니메이션이 생략되는 경우가 있다.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      bottomSheetRef.current?.snapToIndex(1);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [place?.name, place?.latitude, place?.longitude]);

  const distanceMeters = userLocation && place
    ? haversine(userLocation, {
        latitude: place.latitude,
        longitude: place.longitude,
      })
    : null;

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  const savedSlot: MyPlaceSlot | null =
    place &&
    myPlaces.home &&
    near(myPlaces.home.latitude, place.latitude) &&
    near(myPlaces.home.longitude, place.longitude)
      ? 'home'
      : place &&
          myPlaces.work &&
          near(myPlaces.work.latitude, place.latitude) &&
          near(myPlaces.work.longitude, place.longitude)
        ? 'work'
        : null;

  const handleFavorite = async () => {
    if (!place) return;
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
    if (!place) return;
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
    if (!place) return;
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
    if (!place) return;
    const link = place.placeUrl ? `\n${place.placeUrl}` : '';
    try {
      await Share.share({ message: `${place.name}\n${place.address}${link}` });
    } catch {
      // 공유 시트를 닫은 경우 등 — 무시
    }
  };

  const handleSubmit = () => {
    if (!place) return;
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

  const actions = (
    <>
      <TouchableOpacity
        onPress={handleFavorite}
        disabled={favPending}
        style={styles.iconButton}>
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={22}
          color={isFavorite ? semantic.star : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSaveMyPlace} style={styles.iconButton}>
        <Ionicons
          name={
            savedSlot === 'home'
              ? 'home'
              : savedSlot === 'work'
                ? 'business'
                : 'bookmark-outline'
          }
          size={22}
          color={savedSlot ? colors.tint : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={styles.iconButton}>
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </>
  );

  const navigating = resolvingNavigation || navLaunching;
  const [headerReady, setHeaderReady] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setHeaderReady(false);
      return;
    }
    const timer = setTimeout(() => setHeaderReady(true), 300);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  const handleIndicatorStyle = useAnimatedStyle(() => ({
    backgroundColor:
      animatedIndex.value >= SNAP_POINTS.length - 1.5
        ? 'transparent'
        : colors.tabIconDefault,
  }));

  const spacerStyle = useAnimatedStyle(() => ({
    height: interpolate(
      animatedIndex.value,
      [1, 2],
      [
        0,
        Math.max(
          insets.top +
            PAGE_HEADER_HEIGHT +
            HEADER_CONTENT_GAP -
            HANDLE_HEIGHT -
            CONTENT_PADDING,
          0,
        ),
      ],
      Extrapolation.CLAMP,
    ),
  }));

  const renderHandle = useCallback(
    () => (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          const index = currentIndexRef.current;
          if (index < SNAP_POINTS.length - 1) {
            bottomSheetRef.current?.snapToIndex(index + 1);
          }
        }}
        style={styles.handleContainer}>
        <Animated.View style={[styles.handleIndicator, handleIndicatorStyle]} />
      </TouchableOpacity>
    ),
    [handleIndicatorStyle],
  );

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        animateOnMount={false}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        activeOffsetY={[-12, 12]}
        failOffsetX={[-12, 12]}
        animatedIndex={animatedIndex}
        animatedPosition={animatedPosition}
        enablePanDownToClose={false}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture
        onChange={(index) => {
          if (index === -1 && place) onClose();
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
        }}
        handleComponent={renderHandle}>
        {place ? (
          <BottomSheetScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <Animated.View style={spacerStyle} />

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
              {place.name}
            </Text>
            {!isExpanded && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={styles.nameActions}>
                {actions}
              </Animated.View>
            )}
          </View>

          <View style={styles.addressRow}>
            <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>
              {place.address}
            </Text>
            {distanceMeters !== null && (
              <Text style={[styles.distance, { color: colors.tint }]}>
                {formatMeters(distanceMeters)}
              </Text>
            )}
            <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.shareButton}>
              <Feather name="share-2" size={19} color={colors.tint} />
            </TouchableOpacity>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
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
              activeOpacity={0.8}
              style={[styles.actionButton, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.departButtonText, { color: colors.text }]}>출발</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={navigating}
              onPress={handleNavigate}
              activeOpacity={0.8}
              style={[
                styles.actionButton,
                { backgroundColor: colors.tint, opacity: navigating ? 0.8 : 1 },
              ]}>
              {navigating ? (
                <View>
                  <Text style={[styles.navButtonText, { color: 'transparent' }]}>도착</Text>
                  <ActivityIndicator
                    size="small"
                    color={colors.background}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ) : (
                <Text style={[styles.navButtonText, { color: colors.background }]}>도착</Text>
              )}
            </TouchableOpacity>
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

          {(place.phone || hoursText) && (
            <View style={styles.infoGrid}>
              {!!place.phone && (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${place.phone}`)}
                  style={({ pressed }) => [
                    styles.infoCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                  <Text
                    style={[styles.infoCardValue, { color: colors.text }]}
                    numberOfLines={2}>
                    {place.phone}
                  </Text>
                </Pressable>
              )}
              {!!hoursText && (
                <View
                  style={[
                    styles.infoCard,
                    weekLines.length > 1 && styles.infoCardWide,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <View style={weekLines.length > 1 && styles.infoIconTop}>
                    <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  </View>
                  <Text
                    style={[styles.infoCardValue, { color: colors.text }]}
                    numberOfLines={7}>
                    {hoursText}
                  </Text>
                </View>
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
            <View style={styles.reviewSectionHeader}>
              <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>리뷰</Text>
              {(generalPlace?.rating ?? 0) > 0 && (
                <View style={styles.ratingContainer}>
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
            <View style={styles.reviewDivider} />
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
        ) : null}
      </BottomSheet>

      {place && isExpanded && (
        <Animated.View
          pointerEvents={headerReady ? 'auto' : 'box-only'}
          entering={FadeIn.duration(200)}
          style={[
            styles.pageHeader,
            { paddingTop: insets.top, backgroundColor: colors.background },
          ]}>
          <TouchableOpacity
            onPress={() => bottomSheetRef.current?.close()}
            style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.nameActions}>{actions}</View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheetContainer: { zIndex: 20 },
  content: { padding: 20, paddingBottom: 120 },
  handleContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    marginBottom: 4,
  },
  name: { flex: 1, fontSize: 22, fontWeight: '700' },
  nameActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  address: { flex: 1, fontSize: 14 },
  distance: { fontSize: 13, fontWeight: '700' },
  shareButton: { paddingLeft: 2 },
  actionRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 142,
    marginTop: 12,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  departButtonText: { fontSize: 15, fontWeight: '600' },
  navButtonText: { fontSize: 15, fontWeight: '700' },
  openStatusSlot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 132,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
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
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 12,
  },
  infoCardWide: {
    flexBasis: '100%',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  infoIconTop: { marginTop: 1 },
  infoCardValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  submitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  submitCopy: { flex: 1, gap: 3 },
  submitTitle: { fontSize: 14, fontWeight: '800' },
  submitDescription: { fontSize: 12, lineHeight: 17 },
  reviewSection: { borderTopWidth: 1, paddingTop: 20, marginTop: 12 },
  reviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  reviewSectionTitle: { fontSize: 18, fontWeight: '700' },
  ratingContainer: { flexDirection: 'row', alignItems: 'center' },
  ratingStar: { color: semantic.star, fontSize: 14, marginRight: 2 },
  ratingText: { fontSize: 14, fontWeight: '700' },
  reviewCount: { fontSize: 12, marginLeft: 2 },
  reviewDivider: { height: 16 },
  emptyReviews: { fontSize: 13, textAlign: 'center', marginVertical: 16 },
  attribution: { marginTop: 28, fontSize: 11, textAlign: 'center' },
});
