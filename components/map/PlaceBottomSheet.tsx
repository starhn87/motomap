import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
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
import type { Place } from '@/types';

interface Props {
  place: Place | null;
  onClose: () => void;
  onRoutePreview?: (place: Place) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_HEIGHT = Math.round((SCREEN_WIDTH * 9) / 16);

// 스냅 위치 (화면 위에서부터의 거리)
const SNAP_HIDDEN = SCREEN_HEIGHT;
const SNAP_SMALL = SCREEN_HEIGHT * 0.62;  // 38% 보임
const SNAP_MEDIUM = SCREEN_HEIGHT * 0.30; // 70% 보임
const SNAP_FULL = 0;                      // 100% 보임
const SNAPS = [SNAP_FULL, SNAP_MEDIUM, SNAP_SMALL];

const SPRING_CONFIG = { damping: 25, stiffness: 300 };

export default function PlaceBottomSheet({ place, onClose, onRoutePreview }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const userLocation = useMapStore((s) => s.userLocation);
  const { data: latestPlace } = usePlace(place?.id ?? null);
  const displayPlace = latestPlace ?? place;
  const isFavorite = useIsFavorite(place?.id ?? '');
  const { mutateAsync: toggleFav } = useToggleFavorite();

  const translateY = useSharedValue(SNAP_HIDDEN);
  const context = useSharedValue(0);
  const [currentSnap, setCurrentSnap] = useState(1);

  useEffect(() => {
    if (place) {
      translateY.value = withSpring(SNAP_MEDIUM, SPRING_CONFIG);
      setCurrentSnap(1);
    } else {
      translateY.value = withSpring(SNAP_HIDDEN, SPRING_CONFIG);
    }
  }, [place, translateY]);

  const handleClose = useCallback(() => {
    translateY.value = withSpring(SNAP_HIDDEN, SPRING_CONFIG);
    onClose();
  }, [onClose, translateY]);

  const snapTo = useCallback(
    (index: number) => {
      const target = SNAPS[index];
      translateY.value = withSpring(target, SPRING_CONFIG);
      setCurrentSnap(index);
    },
    [translateY]
  );

  const handleExpand = useCallback(() => {
    if (currentSnap > 0) {
      snapTo(currentSnap - 1);
    }
  }, [currentSnap, snapTo]);

  const handleFavorite = useCallback(async () => {
    if (!user) {
      Alert.alert('알림', '로그인이 필요합니다.');
      return;
    }
    if (!place) return;
    try {
      await toggleFav(place.id);
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '즐겨찾기 처리에 실패했습니다.');
    }
  }, [user, place, toggleFav]);

  const findClosestSnap = (y: number): number => {
    let closest = 0;
    let minDist = Math.abs(y - SNAPS[0]);
    for (let i = 1; i < SNAPS.length; i++) {
      const dist = Math.abs(y - SNAPS[i]);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  };

  const onDismiss = () => {
    handleClose();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = translateY.value;
    })
    .onUpdate((e) => {
      const newY = context.value + e.translationY;
      translateY.value = Math.max(SNAP_FULL, Math.min(newY, SNAP_HIDDEN));
    })
    .onEnd((e) => {
      const finalY = translateY.value;

      // 아래로 빠르게 스와이프하면 닫기
      if (e.velocityY > 1500) {
        runOnJS(onDismiss)();
        return;
      }

      // 위로 빠르게 스와이프하면 확장
      if (e.velocityY < -1500) {
        const nextSnap = Math.max(0, findClosestSnap(finalY) - 1);
        translateY.value = withSpring(SNAPS[nextSnap], SPRING_CONFIG);
        runOnJS(setCurrentSnap)(nextSnap);
        return;
      }

      // 닫기 임계값
      if (finalY > SNAP_SMALL + 80) {
        runOnJS(onDismiss)();
        return;
      }

      // 가장 가까운 스냅으로
      const closestIdx = findClosestSnap(finalY);
      translateY.value = withSpring(SNAPS[closestIdx], SPRING_CONFIG);
      runOnJS(setCurrentSnap)(closestIdx);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!place || !displayPlace) return null;

  const category = CATEGORIES[displayPlace.category];
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
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.sheet,
          animatedStyle,
          {
            backgroundColor: colors.background,
          },
        ]}>
        {/* 핸들 바 */}
        <Pressable onPress={handleExpand} style={styles.handleContainer}>
          <View
            style={[
              styles.handleIndicator,
              { backgroundColor: colors.tabIconDefault },
            ]}
          />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEnabled={currentSnap === 0}
          nestedScrollEnabled>
          <Pressable onPress={handleExpand} disabled={currentSnap === 0}>
            {/* 사진 */}
            {displayPlace.photos.length > 0 && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.photoScroll}>
                {displayPlace.photos.map((url, i) => (
                  <Image
                    key={`${url}-${i}`}
                    source={{ uri: url }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            )}

            {/* 헤더 */}
            <View style={styles.header}>
              <View
                style={[
                  styles.categoryBadge,
                  { backgroundColor: category.color + '20' },
                ]}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={[styles.categoryLabel, { color: category.color }]}>
                  {category.label}
                </Text>
              </View>
              {displayPlace.rating > 0 && (
                <View style={styles.ratingContainer}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {displayPlace.rating}
                  </Text>
                  <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>
                    ({displayPlace.reviewCount})
                  </Text>
                </View>
              )}
            </View>

            {/* 이름 + 즐겨찾기 + 닫기 */}
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]}>
                {displayPlace.name}
              </Text>
              <View style={styles.nameActions}>
                <Pressable onPress={handleFavorite} style={styles.favoriteButton}>
                  <Text style={{ fontSize: 22 }}>{isFavorite ? '❤️' : '🤍'}</Text>
                </Pressable>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                  <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 주소 + 거리 */}
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

            {/* 설명 */}
            {displayPlace.description ? (
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                {displayPlace.description}
              </Text>
            ) : null}

            {/* 태그 */}
            {sortedTags.length > 0 && (
              <View style={styles.tags}>
                {sortedTags.map((tag) => {
                  const highlight = HIGHLIGHT_TAGS.has(tag);
                  if (highlight) {
                    return (
                      <View key={tag} style={styles.highlightTag}>
                        <Text style={styles.highlightTagText}>{tag}</Text>
                      </View>
                    );
                  }
                  return (
                    <View
                      key={tag}
                      style={[
                        styles.tag,
                        {
                          backgroundColor:
                            colorScheme === 'dark' ? '#2A2A2A' : '#F3F4F6',
                        },
                      ]}>
                      <Text style={[styles.tagText, { color: colors.text }]}>
                        #{tag}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 정보 카드 */}
            {infoCards.length > 0 && (
              <View style={styles.infoGrid}>
                {infoCards.map((card) => (
                  <View
                    key={card.label}
                    style={[
                      styles.infoCard,
                      {
                        backgroundColor:
                          colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
                        borderColor: colors.border,
                      },
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
          </Pressable>

          {/* 버튼 */}
          <View style={styles.buttonRow}>
            {onRoutePreview && (
              <Pressable
                onPress={() => onRoutePreview(place)}
                style={({ pressed }) => [
                  styles.routePreviewButton,
                  {
                    backgroundColor:
                      colorScheme === 'dark' ? '#2A2A2A' : '#F3F4F6',
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <Text style={[styles.routePreviewText, { color: colors.text }]}>
                  경로 미리보기
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() =>
                openNavigation({
                  name: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                })
              }
              style={({ pressed }) => [
                styles.navButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}>
              <Text style={styles.navButtonText}>네비 시작</Text>
            </Pressable>
          </View>

          {/* 리뷰 */}
          <View style={[styles.reviewSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>
              리뷰
            </Text>
            <ReviewForm placeId={place.id} />
            <View style={styles.reviewDivider} />
            <ReviewList placeId={place.id} />
          </View>
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 30,
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
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  photoScroll: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 16,
    height: PHOTO_HEIGHT,
  },
  photo: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    gap: 4,
  },
  favoriteButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '600',
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
    backgroundColor: '#F97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  highlightTagText: {
    color: '#FFFFFF',
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
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
    backgroundColor: '#F97316',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonText: {
    color: '#FFFFFF',
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
