import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, StyleSheet, Share, ActivityIndicator, Linking, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import CloseIcon from '@/components/ui/CloseIcon';
import PlaceSheetHeaderActions from '@/components/map/PlaceSheetHeaderActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useRef, useEffect, useState, useCallback, memo, useMemo } from 'react';

import { placeWebUrl } from '@/constants/app';
import { formatWeek } from '@/lib/hours';
import OpenBadge from '@/components/place/OpenBadge';
import { usePlaceHours } from '@/hooks/usePlaceHours';
import Colors, { semantic } from '@/constants/Colors';
import { HIGHLIGHT_TAGS } from '@/constants/riderTags';
import { useColorScheme } from '@/components/useColorScheme';
import { router } from 'expo-router';
import { openNavigation, useNavLaunching } from '@/lib/navigation';
import { haversine } from '@/lib/distance';
import { formatMeters } from '@/lib/api/directions';
import { useIsFavorite, useToggleFavorite } from '@/hooks/useFavorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMapStore } from '@/stores/useMapStore';
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
import { haptics } from '@/lib/haptics';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import { findSavedPlaceSlot } from '@/lib/myPlaces';
import { appAlert } from '@/lib/dialog';
import { usePlaceOperationalStatus } from '@/hooks/usePlaceOperationalStatus';
import Skeleton from '@/components/ui/Skeleton';

interface Props {
  place: Place | null;
  onClose: () => void;
  /** 시트 상단의 컨테이너 기준 y — 내 위치 버튼이 시트를 따라 움직이도록 밖에 노출 */
  animatedPosition?: SharedValue<number>;
  /** 내 리뷰에서 진입 — 시트를 끝까지 펼치고 이 리뷰로 스크롤·강조한다. key(nonce)마다 재실행 */
  highlightReview?: { id: string; key: string } | null;
}

// 최소 스냅은 비율이 아니라 고정 높이 — 지도 탭에서는 하단 탭바(~83pt)가
// 시트 아래를 덮으므로, 핸들·제목·X 가 탭바 위로 나오는 딱 그만큼만 잡는다
const SNAP_POINTS = [100, '45%', '100%'];
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
  animatedPosition,
  highlightReview,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navLaunching = useNavLaunching((st) => st.launching);
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
  const [changeReportOpen, setChangeReportOpen] = useState(false);
  const animatedIndex = useSharedValue(1);
  const currentIndexRef = useRef(1);

  // currentIndex를 state와 ref 양쪽에 반영(ref는 핸들 onPress에서 최신값 참조용).
  const syncIndex = useCallback((i: number) => {
    currentIndexRef.current = i;
    setCurrentIndex(i);
  }, []);

  // 시트의 실제 위치(animatedIndex)를 신뢰 소스로 currentIndex를 동기화한다.
  // onAnimate/onChange(이벤트)는 드래그로 직접 끌었을 때 누락/지연되어
  // 헤더 상태가 어긋나거나(100%인데 헤더 없음) 재확장이 안 되는 버그가 있었다.
  useAnimatedReaction(
    () => Math.round(animatedIndex.value),
    (rounded, previous) => {
      if (rounded !== previous) {
        runOnJS(syncIndex)(rounded);
      }
    }
  );
  const user = useAuthStore((s) => s.user);
  const userLocation = useMapStore((s) => s.userLocation);
  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
  const { data: latestPlace } = usePlace(place?.id ?? null);
  const reviewTarget = place ? ({ kind: 'place', id: place.id } as const) : null;
  const { data: reviewPages, isLoading: reviewsLoading } = useReviews(reviewTarget);
  const reviews = useMemo(() => reviewPages?.pages.flat(), [reviewPages]);
  const displayPlace = latestPlace ?? place;
  const operationalStatus = usePlaceOperationalStatus(displayPlace?.id);
  const isFavorite = useIsFavorite(place?.id ?? '');

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  const savedSlot = findSavedPlaceSlot(myPlaces, displayPlace);

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
      haptics.selection();
    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

  const scrollRef = useRef<any>(null);
  const didInitRef = useRef(false);
  // place(장소)가 바뀔 때만 시트 위치를 리셋한다.
  // - 의존성을 [place] 참조로 두면 드래그 확장 중 참조 변경마다 snapToIndex(1)이
  //   호출돼 확장이 취소되므로 [place?.id]로 둔다.
  // - 첫 마운트는 index={1}이 초기 위치를 잡으므로 snapToIndex를 생략한다. 마운트 때
  //   index와 effect가 둘 다 애니메이션을 걸면 열림 도중 드래그가 꼬이기 때문.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    if (place) {
      // 같은 시트 인스턴스가 다음 장소를 표시하므로 이전 장소에서 내린 스크롤을
      // 먼저 지운다. 스냅 위치만 바꾸면 콘텐츠 y는 그대로 남아 중간부터 보인다.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      bottomSheetRef.current?.snapToIndex(1);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [place?.id]);

  useEffect(() => {
    setChangeReportOpen(false);
  }, [place?.id]);

  // 강조 리뷰로 스크롤: 콘텐츠 기준 y = 리뷰섹션 y + 리스트 wrapper y + 카드 y (onLayout 합산)
  const reviewSectionYRef = useRef(0);
  const reviewListYRef = useRef(0);
  const highlightItemYRef = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!highlightReview) return;
    // place 리셋 effect의 snapToIndex(1)과 겹치지 않게 살짝 늦춰 끝까지 편다
    const t1 = setTimeout(() => bottomSheetRef.current?.snapToIndex(2), 200);
    // 확장 애니메이션과 리뷰 렌더가 끝날 즈음 스크롤 (카드 미측정이면 리뷰 섹션 상단으로)
    const t2 = setTimeout(() => {
      const y =
        reviewSectionYRef.current + reviewListYRef.current + highlightItemYRef.current;
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - insets.top - PAGE_HEADER_HEIGHT - HEADER_CONTENT_GAP - 8),
        animated: true,
      });
    }, 950);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [highlightReview?.key]);

  const handleSheetChanges = (index: number) => {
    if (index === -1) onClose();
  };

  const isExpanded = currentIndex === SNAP_POINTS.length - 1;

  // 드래그로 확장(스와이프)이 끝나는 순간 헤더 바가 손가락 위치에 나타나면서
  // 손가락 떼는 동작이 헤더 버튼(✕/뒤로) 탭으로 처리돼 시트가 닫히는 문제가 있었다.
  // 헤더가 나타난 뒤 잠깐 동안 터치를 비활성화해 우발적 탭을 막는다.
  const [headerReady, setHeaderReady] = useState(false);
  useEffect(() => {
    if (!isExpanded) {
      setHeaderReady(false);
      return;
    }
    const t = setTimeout(() => setHeaderReady(true), 300);
    return () => clearTimeout(t);
  }, [isExpanded]);

  // 핸들 인디케이터 색: 확장(페이지) 상태에 가까워지면 투명 처리.
  // currentIndex(state) 대신 animatedIndex로 계산해 renderHandle을 안정 참조로 유지한다.
  const handleIndicatorStyle = useAnimatedStyle(() => ({
    backgroundColor:
      animatedIndex.value >= SNAP_POINTS.length - 1.5
        ? 'transparent'
        : colors.tabIconDefault,
  }));

  // 확장 정도(animatedIndex 1→2)에 비례해 콘텐츠 상단 여백을 연속으로 늘린다.
  // isExpanded 토글로 paddingTop을 한 번에 바꾸면 콘텐츠가 뚝 끊겨 보이기 때문.
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
          0
        ),
      ],
      Extrapolation.CLAMP
    ),
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

  const handleSaveMyPlace = () => {
    if (!displayPlace) return;
    if (savedSlot) {
      const isHome = savedSlot === 'home';
      appAlert(
        isHome ? '집으로 저장된 장소' : '회사로 저장된 장소',
        displayPlace.name,
        [
          { text: '취소', style: 'cancel' },
          {
            text: isHome ? '회사로 변경' : '집으로 변경',
            onPress: async () => {
              await removeMyPlace(savedSlot);
              await saveMyPlace(isHome ? 'work' : 'home', displayPlace);
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
        ],
      );
      return;
    }

    appAlert(
      '내 장소로 저장',
      `${displayPlace.name}\n검색 화면에서 바로 길안내할 수 있어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '집으로',
          onPress: async () => {
            await saveMyPlace('home', displayPlace);
            toast.success('집으로 저장했어요.');
          },
        },
        {
          text: '회사로',
          onPress: async () => {
            await saveMyPlace('work', displayPlace);
            toast.success('회사로 저장했어요.');
          },
        },
      ],
    );
  };

  const renderActions = (expanded: boolean) => (
    <PlaceSheetHeaderActions
      expanded={expanded}
      isFavorite={isFavorite}
      favoriteDisabled={favoritePending}
      favoriteScale={heartScale}
      savedSlot={savedSlot}
      onFavorite={handleFavorite}
      onSaveMyPlace={handleSaveMyPlace}
      onClose={onClose}
    />
  );

  // 핸들 영역은 항상 같은 높이로 렌더(인디케이터 색만 토글). handleComponent를
  // null로 바꾸면 시트 구조 높이가 변해 확장 직후 재snap(축소)이 발생하기 때문.
  // 확장 시엔 별도 헤더 바가 이 영역 위를 덮으므로 인디케이터는 투명 처리한다.
  const renderHandle = useCallback(
    () => (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          const ci = currentIndexRef.current;
          if (ci < SNAP_POINTS.length - 1) {
            bottomSheetRef.current?.snapToIndex(ci + 1);
          }
        }}
        style={styles.handleContainer}>
        <Animated.View
          style={[styles.handleIndicator, handleIndicatorStyle]}
        />
      </TouchableOpacity>
    ),
    [handleIndicatorStyle]
  );

  // 등록 장소라도 영업시간이 비어 있는 곳이 대부분이라(148곳 중 7곳) 구글로
  // 메운다. 우리 데이터가 있으면 그게 우선 — 제보자가 직접 확인한 값이고,
  // "우천 휴무" 처럼 구글이 모르는 사정이 담겨 있다.
  //
  // 아래 early return 보다 위에 있어야 한다. 시트가 닫힌 렌더에서만 훅이 빠지면
  // 순서가 어긋나 React 가 터진다.
  const { data: googleHours, isLoading: googleHoursLoading } = usePlaceHours(
    !displayPlace || displayPlace.hours
      ? null
      : {
          sourceKey: `place:${displayPlace.id}`,
          name: displayPlace.name,
          latitude: displayPlace.latitude,
          longitude: displayPlace.longitude,
        },
  );
  if (!place || !displayPlace) return null;

  const distanceMeters = userLocation
    ? haversine(userLocation, {
        latitude: displayPlace.latitude,
        longitude: displayPlace.longitude,
      })
    : null;

  const sortedTags = [...(displayPlace.tags ?? [])].sort((a, b) => {
    const ha = HIGHLIGHT_TAGS.has(a) ? 0 : 1;
    const hb = HIGHLIGHT_TAGS.has(b) ? 0 : 1;
    return ha - hb;
  });

  const hours = displayPlace.hours ?? googleHours?.hours ?? undefined;

  // 구조화된 hours 가 있으면 요일별로, 없으면 사람이 쓴 원문을 그대로 보여준다
  const weekLines = hours ? formatWeek(hours) : [];
  const scheduleText = weekLines.join('\n') || displayPlace.openingHours;
  // 상단의 간결한 영업 상태에서는 긴 특이사항을 빼고, 상세 카드에서 온전히 보여준다.
  const hoursText = [scheduleText, hours?.note].filter(Boolean).join('\n');

  const infoCards = [
    displayPlace.parkingInfo && {
      icon: <MaterialIcons name="local-parking" size={16} color={colors.textSecondary} />,
      label: '주차',
      value: displayPlace.parkingInfo,
    },
    displayPlace.phone && {
      icon: <Ionicons name="call-outline" size={16} color={colors.textSecondary} />,
      label: '전화',
      value: displayPlace.phone,
      onPress: () => Linking.openURL(`tel:${displayPlace.phone}`).catch(() => {}),
    },
    hoursText && {
      icon: <Ionicons name="time-outline" size={16} color={colors.textSecondary} />,
      label: '영업시간',
      value: hoursText,
      lines: 7,
      // 비동기로 들어와도 이미 보이던 주차·전화 카드의 위치는 바꾸지 않는다.
      // 요일마다 다른 곳은 2열 그리드의 좁은 칸에 우겨넣으면 답답하다.
      wide: weekLines.length > 1,
      loading: googleHoursLoading,
    },
    googleHoursLoading && !hoursText && {
      icon: <Ionicons name="time-outline" size={16} color={colors.textSecondary} />,
      label: '영업시간',
      value: '',
      wide: true,
      loading: true,
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
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        animateOnMount={false}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        // 방향 잠금 — 세로로 12px 움직여야 시트 팬이 활성화되고, 가로로 먼저 12px
        // 가면 시트 팬이 실패해 사진 스트립의 가로 스와이프에 양보한다 (네이버 지도식)
        activeOffsetY={[-12, 12]}
        failOffsetX={[-12, 12]}
        animatedIndex={animatedIndex}
        animatedPosition={animatedPosition}
        onChange={handleSheetChanges}
        // 리뷰 입력 시 시트를 최대로 펼쳐 키보드 위 공간을 확보하고,
        // 입력을 마치면 사용자가 보던 스냅 위치로 되돌린다.
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture
        // 스와이프로는 최소 스냅까지만 내려간다. 실수로 쓸어서 닫히는 걸 막고,
        // 닫기는 X 버튼과 풀확장 헤더의 뒤로가기 두 곳으로 모은다.
        enablePanDownToClose={false}
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
        <BottomSheetScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Animated.View style={spacerStyle} />

          <View style={styles.nameRow}>
            <Pressable
              accessibilityLabel={`${displayPlace.name} 상세 펼치기`}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => {
                const index = currentIndexRef.current;
                if (index < SNAP_POINTS.length - 1) {
                  bottomSheetRef.current?.snapToIndex(index + 1);
                }
              }}
              style={styles.nameRowPressTarget}
            />
            <View pointerEvents="none" style={styles.nameContent}>
              <Text
                style={[styles.name, { color: colors.text }]}
                numberOfLines={2}
                textBreakStrategy="balanced"
                lineBreakStrategyIOS="push-out">
                {displayPlace.name}
              </Text>
            </View>
            {!isExpanded && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={styles.nameActions}>
                {renderActions(false)}
              </Animated.View>
            )}
          </View>

          <View style={styles.addressRow}>
            <Text
              style={[styles.address, { color: colors.textSecondary }]}
              numberOfLines={1}>
              {displayPlace.address}
            </Text>
            {distanceMeters !== null && (
              <Text style={[styles.distance, { color: colors.tint }]}>
                {formatMeters(distanceMeters)}
              </Text>
            )}
          </View>

          {/* 출발/도착/공유 — 시트 안 액션 행. 접힌 스냅에서도 보이도록 상단에 둔다 */}
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
            {/* 비동기 영업시간이 도착하기 전부터 같은 폭을 잡는다. 한 줄에 다
                들어오지 않는 상태는 줄바꿈하지 않고 말줄임한다. */}
            <View style={styles.openStatusSlot}>
              <OpenBadge
                hours={hours}
                businessStatus={googleHours?.businessStatus}
                operationalStatus={operationalStatus}
                inline
              />
            </View>
          </View>

          {displayPlace.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {displayPlace.description}
            </Text>
          ) : null}

          {sortedTags.length > 0 && (
            <View style={styles.tags}>
              {sortedTags.map((tag) => {
                const highlight = HIGHLIGHT_TAGS.has(tag);
                if (highlight) {
                  return (
                    <View
                      key={tag}
                      style={[styles.highlightTag, { backgroundColor: colors.tint }]}>
                      <Text
                        style={[
                          styles.highlightTagText,
                          { color: colors.background },
                        ]}>
                        {tag}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View
                    key={tag}
                    style={[styles.tag, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.tagText, { color: colors.text }]}>
                      #{tag}
                    </Text>
                  </View>
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

          {displayPlace && <NearbyPlaces place={displayPlace} />}

          <View
            style={[styles.reviewSection, { borderTopColor: colors.border }]}
            onLayout={(e) => {
              reviewSectionYRef.current = e.nativeEvent.layout.y;
            }}>
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
            <ReviewForm target={{ kind: 'place', id: place.id }} />
            <View style={styles.reviewDivider} />
            <View
              onLayout={(e) => {
                reviewListYRef.current = e.nativeEvent.layout.y;
              }}>
              <ReviewList
                target={{ kind: 'place', id: place.id }}
                highlight={highlightReview}
                onHighlightLayout={(y) => {
                  highlightItemYRef.current = y;
                }}
              />
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* 헤더 바: 바텀시트와 별개의 레이어. 확장(페이지) 시에만 화면 상단에 고정 표시 */}
      {isExpanded && (
        <Animated.View
          pointerEvents={headerReady ? 'auto' : 'box-only'}
          entering={FadeIn.duration(200)}
          style={[
            styles.pageHeader,
            {
              paddingTop: insets.top,
              backgroundColor: colors.background,
            },
          ]}>
          <TouchableOpacity
            onPress={() => bottomSheetRef.current?.close()}
            style={[styles.iconButton, styles.pageHeaderIconButton]}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.nameActions}>{renderActions(true)}</View>
        </Animated.View>
      )}

      <PlaceChangeReportSheet
        visible={changeReportOpen}
        placeId={displayPlace.id}
        placeName={displayPlace.name}
        operationalStatus={operationalStatus}
        onClose={() => setChangeReportOpen(false)}
      />
    </>
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
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    marginBottom: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
  },
  nameRowPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  nameContent: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingRight: 16,
  },
  nameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeaderIconButton: {
    width: 44,
    height: 44,
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
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  highlightTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  highlightTagText: {
    fontSize: 12,
    fontWeight: '700',
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
  openStatusSlot: {
    flex: 1,
    minWidth: 0,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
