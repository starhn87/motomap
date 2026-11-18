import { useRevealKeyboardInput } from '@/hooks/useRevealKeyboardInput';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, StyleSheet, Share, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Text } from '@/components/ui/AppText';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import PlaceSheetHeaderActions from '@/components/map/PlaceSheetHeaderActions';
import { placeSheetOffsetX, placeSheetOffsetY } from './placeSheetPanOffsets';
import { PlaceSheetBackground, PlaceSheetHeaderOverlay, PlaceSheetHeaderProvider, PlaceSheetNameRow } from '@/components/map/PlaceSheetHeader';
import { ANDROID_TOP_CONTROL_GAP } from '@/components/navigation/headerSpacing';
import { usePlaceReviewFocus } from '@/hooks/usePlaceReviewFocus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useRef, useEffect, useState, useCallback, memo, useMemo } from 'react';

import { placeWebUrl } from '@/constants/app';
import { PlaceHoursRow, showsPlaceHoursRow } from '@/components/place/PlaceHoursDisclosure';
import { PlaceAddressRow, PlacePhoneRow } from '@/components/place/PlaceContactRows';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import Colors, { semantic } from '@/constants/Colors';
import { HIGHLIGHT_TAGS } from '@/constants/riderTags';
import { useColorScheme } from '@/components/useColorScheme';
import { router } from 'expo-router';
import { openNavigation, useNavLaunching } from '@/lib/navigation';
import { useIsFavorite, useToggleFavorite } from '@/hooks/useFavorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePlace } from '@/hooks/usePlace';
import ReviewList from '@/components/review/ReviewList';
import ReviewForm from '@/components/review/ReviewForm';
import RiderPlaceFacts from '@/components/place/RiderPlaceFacts';
import PlaceChangeReportSheet from '@/components/place/PlaceChangeReportSheet';
import PhotoStrip from '@/components/map/PhotoStrip';
import NearbyPlaces from '@/components/map/NearbyPlaces';
import { useReviews } from '@/hooks/useReviews';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';
import { usePlaceOperationalStatus } from '@/hooks/usePlaceOperationalStatus';
import Skeleton from '@/components/ui/Skeleton';

interface Props {
  place: Place | null;
  onClose: () => void;
  /** 내 리뷰에서 진입 — 시트를 펼쳐 리뷰 영역으로 이동하고 선택한 리뷰를 강조한다. */
  highlightReview?: { id: string; key: string } | null;
  openExpanded?: boolean;
  /** 지도에서 선택 화면에서 열 때 — 출발·도착·공유 대신 이 버튼 하나와 장소 정보만 보인다. */
  pickAction?: { label: string; onPress: () => void };
}

// 헤더 바(safe-area 제외) 높이. spacer 계산에 쓰는 고정값.
const PAGE_HEADER_HEIGHT = 56;
// 드래그 핸들 영역 높이 (paddingVertical 12*2 + 인디케이터 4)
const HANDLE_HEIGHT = 28;
// 확장 시 헤더 바와 콘텐츠 사이 간격
const HEADER_CONTENT_GAP = 6;
// styles.content 의 상단 패딩 (spacer 높이 계산에 사용)
const CONTENT_PADDING = 20;

function PlaceBottomSheet({
  place,
  onClose,
  highlightReview,
  openExpanded = false,
  pickAction,
}: Props) {
  const [hoursExpanded, setHoursExpanded] = useState(false);
  useEffect(() => { setHoursExpanded(false); }, [place?.name, place?.latitude, place?.longitude]);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navLaunching = useNavLaunching((st) => st.launching);
  const insets = useSafeAreaInsets();
  // 최소 높이에서도 시스템 하단 바 위로 제목과 닫기 버튼이 모두 보이게 한다.
  const snapPoints = useMemo(() => [100 + insets.bottom, '45%', '100%'], [insets.bottom]);
  const headerTop = insets.top + (Platform.OS === 'android' ? ANDROID_TOP_CONTROL_GAP : 0);
  const initialIndex = openExpanded || highlightReview ? 2 : 1;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const closeRequestedFor = useRef<typeof place>(null);
  const requestSheetClose = () => {
    closeRequestedFor.current = place;
    bottomSheetRef.current?.close();
  };
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [changeReportOpen, setChangeReportOpen] = useState(false);
  const animatedIndex = useSharedValue(-1);
  const reviewRequested = !!highlightReview;
  useAnimatedReaction(
    () => reviewRequested && animatedIndex.value === 2,
    (expanded, previous) => {
      if (expanded !== !!previous) runOnJS(setReviewExpanded)(expanded);
    },
  );
  const advanceSheet = useCallback(() => {
    const index = Math.round(animatedIndex.value);
    if (index >= 0 && index < snapPoints.length - 1) {
      bottomSheetRef.current?.snapToIndex(index + 1);
    }
  }, [animatedIndex, snapPoints.length]);
  const user = useAuthStore((s) => s.user);
  const { data: latestPlace } = usePlace(place?.id ?? null);
  const reviewTarget = place ? ({ kind: 'place', id: place.id } as const) : null;
  const { data: reviewPages, isLoading: reviewsLoading } = useReviews(reviewTarget);
  const reviews = useMemo(() => reviewPages?.pages.flat(), [reviewPages]);
  const displayPlace = latestPlace === undefined ? place : latestPlace;
  const operationalStatus = usePlaceOperationalStatus(displayPlace?.id);
  const isFavorite = useIsFavorite(place?.id ?? '');


  // 장소 자체 사진과 리뷰 사진을 한곳에서 훑되 확대 화면에는 사진만 보여준다.
  const photoItems = useMemo(
    () => [
      ...(displayPlace?.photos ?? []).map((url) => ({ url })),
      ...(reviews ?? []).flatMap((review) => review.photos.map((url) => ({ url }))),
    ],
    [displayPlace?.photos, reviews],
  );
  const { mutateAsync: toggleFav, isPending: favoritePending } = useToggleFavorite();

  // 하트 팝 — 즐겨찾기를 추가할 때만 커졌다 돌아온다 (해제 시엔 효과 없음)
  const heartScale = useSharedValue(1);

  const handleFavorite = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    if (!place) return;
    if (!isFavorite) {
      heartScale.value = withSequence(
        withTiming(1.35, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) })
      );
    }
    try {
      await toggleFav({ placeId: place.id, on: !isFavorite });

    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

  const scrollRef = useRef<any>(null);
  const keyboardInput = useRevealKeyboardInput(scrollRef, { padOccludedContent: true });
  const [handleMeasured, setHandleMeasured] = useState(false);
  const visiblePlaceId = place && displayPlace ? place.id : null;
  useEffect(() => {
    if (!handleMeasured) return;
    if (!visiblePlaceId) {
      bottomSheetRef.current?.close();
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // 핸들과 컨테이너의 레이아웃이 UI 스레드에 반영된 프레임에서 한 번만 연다.
    const frame = requestAnimationFrame(() => bottomSheetRef.current?.snapToIndex(initialIndex));
    return () => cancelAnimationFrame(frame);
  }, [handleMeasured, visiblePlaceId, initialIndex, highlightReview?.key]);

  useEffect(() => {
    setChangeReportOpen(false);
  }, [place?.id]);

  const onReviewLayout = usePlaceReviewFocus(
    highlightReview?.key, reviewExpanded && !reviewsLoading, headerTop + PAGE_HEADER_HEIGHT + HEADER_CONTENT_GAP, scrollRef,
  );

  const handleSheetClosed = () => {
    const requested = closeRequestedFor.current;
    closeRequestedFor.current = null;
    if (requested && requested.id === visiblePlaceId) onClose();
  };

  const handleIndicatorStyle = useAnimatedStyle(() => ({
    opacity: animatedIndex.value >= 1.5 ? 0 : 1,
  }));

  const headerSpace = Math.max(
    headerTop + PAGE_HEADER_HEIGHT + HEADER_CONTENT_GAP - HANDLE_HEIGHT - CONTENT_PADDING,
    0,
  );
  // 상단 여백은 고정하고 시트 이동 중에는 Yoga 레이아웃 대신 위치만 바꾼다.
  const contentMotionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(animatedIndex.value, [1, 2], [-headerSpace, 0], Extrapolation.CLAMP) }],
  }));

  const handleShare = async () => {
    if (!displayPlace) return;
    try {
      await Share.share({
        message: `${displayPlace.name}\n${displayPlace.address}\n\n모토맵에서 장소 보기\n${placeWebUrl(displayPlace.id)}`,
      });
    } catch {
      // 공유 시트를 닫은 경우 등 — 무시
    }
  };

  const renderActions = (expanded: boolean) => (
    <PlaceSheetHeaderActions
      expanded={expanded}
      isFavorite={isFavorite}
      showFavorite={!!user}
      favoriteDisabled={favoritePending}
      favoriteScale={heartScale}
      onFavorite={handleFavorite}
      onClose={requestSheetClose}
    />
  );

  // 핸들 영역은 항상 같은 높이로 렌더(인디케이터 색만 토글). handleComponent를
  // null로 바꾸면 시트 구조 높이가 변해 확장 직후 재snap(축소)이 발생하기 때문.
  // 확장 시엔 별도 헤더 바가 이 영역 위를 덮으므로 인디케이터는 투명 처리한다.
  const renderHandle = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="장소 상세 펼치기"
        accessibilityRole="button"
        activeOpacity={1}
        onPress={advanceSheet}
        onLayout={() => setHandleMeasured(true)}
        style={styles.handleContainer}>
        <Animated.View
          style={[styles.handleIndicator, { backgroundColor: colors.tabIconDefault }, handleIndicatorStyle]}
        />
      </TouchableOpacity>
    ),
    [advanceSheet, colors.tabIconDefault, handleIndicatorStyle]
  );

  // 등록 장소라도 영업시간이 비어 있는 곳이 대부분이라(148곳 중 7곳) 구글로
  // 메운다. 우리 데이터가 있으면 그게 우선 — 제보자가 직접 확인한 값이고,
  // "우천 휴무" 처럼 구글이 모르는 사정이 담겨 있다.
  //
  const { data: googleHours } = usePlaceHours(
    !displayPlace || displayPlace.hours
      ? null
      : {
          sourceKey: `place:${displayPlace.id}`,
          name: displayPlace.name,
          latitude: displayPlace.latitude,
          longitude: displayPlace.longitude,
        },
  );
  const sortedTags = [...(displayPlace?.tags ?? [])].sort((a, b) => {
    const ha = HIGHLIGHT_TAGS.has(a) ? 0 : 1;
    const hb = HIGHLIGHT_TAGS.has(b) ? 0 : 1;
    return ha - hb;
  });

  const hours = displayPlace?.hours ?? googleHours?.hours ?? undefined;
  const actionRowAlone = !displayPlace?.phone && !showsPlaceHoursRow({
    hours, fallbackText: displayPlace?.openingHours, businessStatus: googleHours?.businessStatus, operationalStatus,
  });

  const infoCards = [
    displayPlace?.parkingInfo && {
      icon: <MaterialIcons name="local-parking" size={16} color={colors.textSecondary} />,
      label: '주차',
      value: displayPlace.parkingInfo,
    },
  ].filter(Boolean) as Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    lines?: number;
    wide?: boolean;
    loading?: boolean;
    onPress?: () => void;
  }>;


  return (
    <PlaceSheetHeaderProvider
      animatedIndex={animatedIndex}
      header={visiblePlaceId ? { top: headerTop, onClose: requestSheetClose, actions: renderActions(true) } : null}>
      <BottomSheet
        backdropComponent={PlaceSheetHeaderOverlay}
        backgroundComponent={PlaceSheetBackground}
        ref={bottomSheetRef}
        // 시트 전체를 하나로 묶으면 사진·헤더·리뷰 버튼이 접근성 트리에서 숨는다.
        accessible={false}
        index={-1}
        animateOnMount={false}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        // 하단 인셋 0의 위치는 유지하고 이동 중 본문 마스크의 높이 재계산을 막는다.
        detached
        enableOverDrag={false}
        activeOffsetY={placeSheetOffsetY}
        failOffsetX={placeSheetOffsetX}
        animatedIndex={animatedIndex}
        onClose={handleSheetClosed}
        onChange={keyboardInput.reveal}
        // 리뷰 입력 시 시트를 최대로 펼쳐 키보드 위 공간을 확보하고,
        // 입력을 마치면 사용자가 보던 스냅 위치로 되돌린다.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        enableBlurKeyboardOnGesture
        // 스와이프로는 최소 스냅까지만 내려간다. 실수로 쓸어서 닫히는 걸 막고,
        // 닫기는 X 버튼과 풀확장 헤더의 뒤로가기 두 곳으로 모은다.
        enablePanDownToClose={false}
        containerStyle={styles.sheetContainer}
        backgroundStyle={{
          backgroundColor: colors.background,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }}
        handleComponent={renderHandle}>
        {place && displayPlace && (
        <BottomSheetScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 + keyboardInput.extraScrollInset }]}
          onContentSizeChange={keyboardInput.reveal}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Animated.View style={contentMotionStyle}>
            <View style={{ height: headerSpace }} />

          <PlaceSheetNameRow name={displayPlace.name} onPress={advanceSheet}>
            {renderActions(false)}
          </PlaceSheetNameRow>

          <PlaceAddressRow address={displayPlace.address} />

          {/* 출발/도착/공유 — 시트 안 액션 행. 접힌 스냅에서도 보이도록 상단에 둔다 */}
          {pickAction ? (
            // 지도에서 선택(경로 지점 편집) 중에는 출발·도착·공유로 흐름을 벗어나지 않고 이 장소를 고르는 버튼만 둔다.
            <View style={[styles.actionRow, actionRowAlone && styles.actionRowAlone]}>
              <TouchableOpacity
                accessibilityLabel={pickAction.label}
                accessibilityRole="button"
                onPress={pickAction.onPress}
                activeOpacity={0.8}
                style={[styles.actionButton, { backgroundColor: colors.tint }]}>
                <Text style={[styles.navButtonText, { color: colors.background }]}>{pickAction.label}</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={[styles.actionRow, actionRowAlone && styles.actionRowAlone]}>
            <TouchableOpacity
              accessibilityRole="button"
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
              accessibilityLabel="도착"
              accessibilityRole="button"
              accessibilityState={{ disabled: navLaunching, busy: navLaunching }}
              disabled={navLaunching}
              onPress={() =>
                openNavigation({
                  name: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                  placeId: place.id,
                })
              }
              activeOpacity={0.8}
              style={[
                styles.actionButton,
                { backgroundColor: colors.tint, opacity: navLaunching ? 0.8 : 1 },
              ]}>
              {navLaunching ? (
                // 텍스트를 투명으로 남겨 버튼 폭을 유지하고 스피너를 겹친다
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
            <TouchableOpacity
              accessibilityLabel="장소 공유"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={handleShare}
              style={[
                styles.actionButton,
                styles.shareActionButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}>
              <Ionicons name="share-outline" size={20} color={colors.tint} />
              <Text style={[styles.shareButtonText, { color: colors.tint }]}>공유</Text>
            </TouchableOpacity>
          </View>
          )}

          <PlacePhoneRow phone={displayPlace.phone} />
          <PlaceHoursRow hours={hours} fallbackText={displayPlace.openingHours}
            businessStatus={googleHours?.businessStatus} operationalStatus={operationalStatus}
            expanded={hoursExpanded} onToggle={() => setHoursExpanded(value => !value)} />

          {displayPlace.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {displayPlace.description}
            </Text>
          ) : null}

          {sortedTags.length > 0 && (
            <View style={styles.tags}>
              {sortedTags.map((tag) => {
                const highlight = HIGHLIGHT_TAGS.has(tag);
                return (
                  <Text
                    key={tag}
                    style={[styles.tagText, { color: highlight ? colors.text : colors.textSecondary },
                      highlight && styles.highlightTagText]}>
                    {tag}
                  </Text>
                );
              })}
            </View>
          )}

          {infoCards.length > 0 && (
            <View style={styles.infoGrid}>
              {/* RNGH Touchable 은 flexBasis 를 잇지 못해 카드 폭이 무너진다(실측
                  2회) — 레이아웃이 View 와 동일한 RN Pressable 로 카드째 감싼다 */}
              {infoCards.map((card) => (
                <Pressable
                  key={card.label}
                  accessibilityRole={card.onPress ? 'button' : undefined}
                  accessibilityLabel={card.onPress ? `${card.label} ${card.value}` : undefined}
                  disabled={!card.onPress}
                  onPress={card.onPress}
                  style={({ pressed }) => [
                    styles.infoCard,
                    card.wide && styles.infoCardWide,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <View style={card.wide && styles.infoIconTop}>{card.icon}</View>
                  {card.loading ? (
                    <View style={styles.infoCardLoading}>
                      <Skeleton width="86%" height={13} />
                      <Skeleton width="72%" height={13} />
                      <Skeleton width="54%" height={13} />
                    </View>
                  ) : (
                    <Text
                      style={[styles.infoCardValue, { color: colors.text }]}
                      numberOfLines={card.lines ?? 2}>
                      {card.value}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <RiderPlaceFacts
            placeId={displayPlace.id}
            onReportPlaceChange={() => {
              if (!user) {
                toast.info('로그인하면 장소 정보를 제보할 수 있어요.');
                return;
              }
              setChangeReportOpen(true);
            }}
          />

          {photoItems.length > 0 ? (
            <View style={styles.photoSection}>
              <Text style={[styles.photoSectionTitle, { color: colors.text }]}>
                사진 {photoItems.length}
              </Text>
              <PhotoStrip items={photoItems} bleed={CONTENT_PADDING} />
            </View>
          ) : reviewsLoading ? (
            <View style={styles.photoSection}>
              <Skeleton width={72} height={18} />
              <Skeleton width={150} height={150} radius={12} />
            </View>
          ) : null}

          {displayPlace && !pickAction && <NearbyPlaces place={displayPlace} />}

          <View
            style={[styles.reviewSection, { borderTopColor: colors.border }]}
            key={highlightReview?.key ?? place.id}
            onLayout={onReviewLayout}>
            <View style={styles.reviewSectionHeader}>
              <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>
                리뷰
              </Text>
              {displayPlace.rating > 0 && (
                <View style={styles.ratingContainer}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {displayPlace.rating}
                  </Text>
                  <Text
                    style={[styles.reviewCount, { color: colors.textSecondary }]}>
                    ({displayPlace.reviewCount})
                  </Text>
                </View>
              )}
            </View>
            {!!user && !pickAction && <ReviewForm onInputFocus={keyboardInput.onFocus} target={{ kind: 'place', id: place.id }} />}
            {!!user && !pickAction && <View style={styles.reviewDivider} />}
            <ReviewList
              onInputFocus={keyboardInput.onFocus}
              target={{ kind: 'place', id: place.id }}
              allowWriting={!pickAction}
              highlight={highlightReview}
            />
          </View>
          </Animated.View>
        </BottomSheetScrollView>
        )}
      </BottomSheet>

      {displayPlace && <PlaceChangeReportSheet
        visible={changeReportOpen}
        placeId={displayPlace.id}
        placeName={displayPlace.name}
        operationalStatus={operationalStatus}
        onClose={() => setChangeReportOpen(false)}
      />}
    </PlaceSheetHeaderProvider>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    zIndex: 20,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
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
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 14,
    color: semantic.star,
    marginRight: 2,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCount: {
    fontSize: 12,
    marginLeft: 2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  address: {
    flex: 1,
    fontSize: 14,
  },
  distance: {
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    marginBottom: 16,
  },
  tagText: {
    fontSize: 12,
    lineHeight: 18,
  },
  highlightTagText: {
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  // 아이콘이 곧 라벨이다 — 전화 아이콘 옆의 "전화"처럼 겹치는 글자는 두지 않고
  // 한 줄로 눕혀 카드 높이를 줄인다.
  infoCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoCardWide: {
    flexBasis: '100%',
    // 여러 줄이면 아이콘이 세로 중앙에 뜨는 게 어색하다 — 첫 줄에 붙인다
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  infoIconTop: {
    marginTop: 1,
  },
  infoCardValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  infoCardLoading: {
    flex: 1,
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  // 아래에 전화·운영시간 행이 없으면 다음 카드·섹션이 버튼에 붙지 않게 띄운다.
  actionRowAlone: { marginBottom: 16 },
  actionButton: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareActionButton: {
    flexDirection: 'row',
    gap: 5,
    borderWidth: 1,
  },
  departButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoSection: {
    marginTop: 12,
    gap: 10,
  },
  photoSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  reviewSection: {
    borderTopWidth: 1,
    paddingTop: 18,
    marginTop: 20,
  },
  reviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  reviewSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  reviewDivider: {
    height: 16,
  },
});

export default memo(PlaceBottomSheet);
