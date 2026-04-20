import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useRef, useEffect } from 'react';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation } from '@/lib/navigation';
import { useIsFavorite, useToggleFavorite } from '@/hooks/useFavorites';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePlace } from '@/hooks/usePlace';
import ReviewList from '@/components/review/ReviewList';
import ReviewForm from '@/components/review/ReviewForm';
import type { Place } from '@/types';

interface Props {
  place: Place | null;
  onClose: () => void;
  onRoutePreview?: (place: Place) => void;
}

export default function PlaceBottomSheet({ place, onClose, onRoutePreview }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['38%', '75%'], []);
  const user = useAuthStore((s) => s.user);
  const { data: latestPlace } = usePlace(place?.id ?? null);
  const displayPlace = latestPlace ?? place;
  const isFavorite = useIsFavorite(place?.id ?? '');
  const { mutateAsync: toggleFav } = useToggleFavorite();

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

  useEffect(() => {
    if (place) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [place]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  if (!place || !displayPlace) return null;

  const category = CATEGORIES[displayPlace.category];

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      enablePanDownToClose
      backgroundStyle={{
        backgroundColor: colors.background,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.tabIconDefault,
        width: 40,
      }}>
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
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

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{displayPlace.name}</Text>
          <Pressable onPress={handleFavorite} style={styles.favoriteButton}>
            <Text style={{ fontSize: 22 }}>{isFavorite ? '❤️' : '🤍'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.address, { color: colors.textSecondary }]}>
          {displayPlace.address}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {displayPlace.description}
        </Text>

        {displayPlace.tags.length > 0 && (
          <View style={styles.tags}>
            {displayPlace.tags.map((tag) => (
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
            ))}
          </View>
        )}

        {(displayPlace.openingHours || displayPlace.parkingInfo) && (
          <View
            style={[styles.infoSection, { borderTopColor: colors.border }]}>
            {displayPlace.openingHours && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  영업시간
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {displayPlace.openingHours}
                </Text>
              </View>
            )}
            {displayPlace.parkingInfo && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  주차
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {displayPlace.parkingInfo}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => onRoutePreview?.(place)}
            style={({ pressed }) => [
              styles.routePreviewButton,
              {
                backgroundColor: colorScheme === 'dark' ? '#2A2A2A' : '#F3F4F6',
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <Text style={[styles.routePreviewText, { color: colors.text }]}>
              경로 미리보기
            </Text>
          </Pressable>
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

        {/* 리뷰 섹션 */}
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
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
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
  favoriteButton: {
    padding: 4,
    marginLeft: 8,
  },
  address: {
    fontSize: 14,
    marginBottom: 8,
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
  infoSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginBottom: 16,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
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
