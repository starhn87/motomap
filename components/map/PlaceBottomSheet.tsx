import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFooter,
} from '@gorhom/bottom-sheet';
import type { BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useRef, useEffect, useState } from 'react';

import Colors from '@/constants/Colors';
import { HIGHLIGHT_TAGS } from '@/constants/riderTags';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation } from '@/lib/navigation';
import { haversine } from '@/lib/distance';
import { formatDistance } from '@/lib/api/directions';
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
// 헤더 바 높이 실측 전 사용할 fallback (실제 높이는 onLayout으로 측정)
const PAGE_HEADER_HEIGHT = 56;
// 드래그 핸들 영역 높이 (paddingVertical 12*2 + 인디케이터 4)
const HANDLE_HEIGHT = 28;

export default function PlaceBottomSheet({
  place,
  onClose,
  onRoutePreview,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
  const [headerHeight, setHeaderHeight] = useState(0);
  const animatedIndex = useSharedValue(1);

  // 시트의 실제 위치(animatedIndex)를 신뢰 소스로 currentIndex를 동기화한다.
  // onAnimate/onChange(이벤트)는 드래그로 직접 끌었을 때 누락/지연되어
  // 헤더 상태가 어긋나거나(100%인데 헤더 없음) 재확장이 안 되는 버그가 있었다.
  useAnimatedReaction(
    () => Math.round(animatedIndex.value),
    (rounded, previous) => {
      if (rounded !== previous) {
        runOnJS(setCurrentIndex)(rounded);
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

  useEffect(() => {
    if (place) {
      bottomSheetRef.current?.snapToIndex(1);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [place]);

  const handleSheetChanges = (index: number) => {
    if (index === -1) onClose();
  };

  const isExpanded = currentIndex === SNAP_POINTS.length - 1;

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
  const renderHandle = () => {
    const canExpand = currentIndex < SNAP_POINTS.length - 1;
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          if (canExpand) bottomSheetRef.current?.snapToIndex(currentIndex + 1);
        }}
        disabled={!canExpand}
        style={styles.handleContainer}>
        <View
          style={[
            styles.handleIndicator,
            {
              backgroundColor: isExpanded
                ? 'transparent'
                : colors.tabIconDefault,
            },
          ]}
        />
      </TouchableOpacity>
    );
  };

  const renderFooter = (props: BottomSheetFooterProps) => {
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
  };

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
        snapPoints={SNAP_POINTS}
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
          contentContainerStyle={[
            styles.content,
            isExpanded && {
              paddingTop:
                (headerHeight || insets.top + PAGE_HEADER_HEIGHT) +
                20 -
                HANDLE_HEIGHT,
            },
          ]}
          showsVerticalScrollIndicator={false}>
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
                {formatDistance(distanceMeters)}
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
          entering={FadeIn.duration(200)}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
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
    color: '#FBBF24',
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
