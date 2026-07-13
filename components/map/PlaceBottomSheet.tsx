import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFooter,
} from '@gorhom/bottom-sheet';
import type { BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useRef, useEffect, useState, useCallback, memo } from 'react';

import Colors, { semantic } from '@/constants/Colors';
import { HIGHLIGHT_TAGS } from '@/constants/riderTags';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation } from '@/lib/navigation';
import { haversine } from '@/lib/distance';
import { formatMeters } from '@/lib/api/directions';
import { useIsFavorite, useToggleFavorite } from '@/hooks/useFavorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMapStore } from '@/stores/useMapStore';
import { usePlace } from '@/hooks/usePlace';
import ReviewList from '@/components/review/ReviewList';
import ReviewForm from '@/components/review/ReviewForm';
import PhotoGrid from '@/components/map/PhotoGrid';
import { useReviews } from '@/hooks/useReviews';
import { toast } from '@/lib/toast';
import type { Place } from '@/types';

interface Props {
  place: Place | null;
  onClose: () => void;
  onRoutePreview?: (place: Place) => void;
}

const SNAP_POINTS = ['28%', '60%', '100%'];
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
  onRoutePreview,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
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
  const { data: latestPlace } = usePlace(place?.id ?? null);
  const { data: reviews } = useReviews(place?.id ?? null);
  const displayPlace = latestPlace ?? place;
  const isFavorite = useIsFavorite(place?.id ?? '');

  // 장소 자체 사진 + 리뷰 사진을 모두 모음
  const allPhotos = [
    ...(displayPlace?.photos ?? []),
    ...(reviews ?? []).flatMap((r) => r.photos),
  ];
  const { mutateAsync: toggleFav } = useToggleFavorite();

  const handleFavorite = async () => {
    if (!user) {
      toast.info('로그인이 필요합니다.');
      return;
    }
    if (!place) return;
    try {
      await toggleFav(place.id);
    } catch (error: any) {
      toast.error('즐겨찾기 처리에 실패했습니다.', error.message);
    }
  };

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
      bottomSheetRef.current?.snapToIndex(1);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [place?.id]);

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

  const actions = (
    <>
      <TouchableOpacity onPress={handleFavorite} style={styles.iconButton}>
        <Text style={{ fontSize: 26 }}>{isFavorite ? '❤️' : '🤍'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} style={styles.iconButton}>
        <Text style={[styles.closeText, { color: colors.textSecondary }]}>✕</Text>
      </TouchableOpacity>
    </>
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

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => {
    if (!place) return null;
    return (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={() => onRoutePreview?.(place)}
              activeOpacity={0.8}
              style={[
                styles.routePreviewButton,
                { backgroundColor: colors.surfaceMuted },
              ]}>
              <Text style={[styles.routePreviewText, { color: colors.text }]}>
                경로 미리보기
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={() =>
                openNavigation({
                  name: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
              activeOpacity={0.8}
              style={[styles.navButton, { backgroundColor: colors.tint }]}>
              <Text style={[styles.navButtonText, { color: colors.background }]}>
                네비 시작
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetFooter>
    );
    },
    [place, onRoutePreview, colors]
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

  const infoCards = [
    displayPlace.openingHours && {
      icon: '🕐',
      label: '영업시간',
      value: displayPlace.openingHours,
    },
    displayPlace.parkingInfo && {
      icon: '🅿️',
      label: '주차',
      value: displayPlace.parkingInfo,
    },
    displayPlace.phone && {
      icon: '☎️',
      label: '전화',
      value: displayPlace.phone,
    },
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>;

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        animateOnMount={false}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        animatedIndex={animatedIndex}
        onChange={handleSheetChanges}
        enablePanDownToClose
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
        handleComponent={renderHandle}
        footerComponent={renderFooter}>
        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Animated.View style={spacerStyle} />
          <PhotoGrid photos={allPhotos} />

          {!isExpanded && displayPlace.rating > 0 && (
            <View style={styles.ratingRow}>
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
            </View>
          )}

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {displayPlace.name}
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
              {infoCards.map((card) => (
                <View
                  key={card.label}
                  style={[
                    styles.infoCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <Text style={styles.infoCardIcon}>{card.icon}</Text>
                  <Text
                    style={[styles.infoCardLabel, { color: colors.textSecondary }]}>
                    {card.label}
                  </Text>
                  <Text
                    style={[styles.infoCardValue, { color: colors.text }]}
                    numberOfLines={2}>
                    {card.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.reviewSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>
              리뷰
            </Text>
            <ReviewForm placeId={place.id} />
            <View style={styles.reviewDivider} />
            <ReviewList placeId={place.id} />
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
            style={styles.iconButton}>
            <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.nameActions}>
            {displayPlace.rating > 0 && (
              <View style={styles.ratingContainer}>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={[styles.ratingText, { color: colors.text }]}>
                  {displayPlace.rating}
                </Text>
              </View>
            )}
            {actions}
          </View>
        </Animated.View>
      )}
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
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 12,
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
    flex: 1,
  },
  nameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    fontWeight: '600',
  },
  backIcon: {
    fontSize: 26,
    fontWeight: '700',
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
  infoCard: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoCardIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  infoCardLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  infoCardValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  routePreviewButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  routePreviewText: {
    fontSize: 14,
    fontWeight: '600',
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    marginTop: 12,
  },
  reviewSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  reviewDivider: {
    height: 16,
  },
});

export default memo(PlaceBottomSheet);
