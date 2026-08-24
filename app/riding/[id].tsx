import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { NaverMapMarkerOverlay, NaverMapView } from '@mj-studio/react-native-naver-map';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { CATEGORIES } from '@/constants/categories';
import {
  GENERAL_MARKER_CIRCLE,
  MARKER_IMAGES_CIRCLE,
} from '@/constants/markerImages';
import { ridingGuideWebUrl } from '@/constants/app';
import { useRidingGuide } from '@/hooks/useRidingGuides';
import { focusPlaceOnMap, focusPointOnMap } from '@/lib/mapFocus';
import { track } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import type { RidingGuideStop } from '@/types';

function cameraFor(stops: RidingGuideStop[]) {
  const latitudes = stops.map((stop) => stop.place.latitude);
  const longitudes = stops.map((stop) => stop.place.longitude);
  const latitude = (Math.max(...latitudes) + Math.min(...latitudes)) / 2;
  const longitude = (Math.max(...longitudes) + Math.min(...longitudes)) / 2;
  const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const lngSpan = (Math.max(...longitudes) - Math.min(...longitudes)) * 0.8;
  const span = Math.max(latSpan, lngSpan, 0.008);
  return {
    latitude,
    longitude,
    zoom: stops.length === 1 ? 13 : Math.min(12, Math.max(7, Math.log2(180 / span) - 1.1)),
  };
}

export default function RidingGuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const guideId = typeof id === 'string' ? id : null;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: guide, isLoading } = useRidingGuide(guideId);
  const tracked = useRef(false);

  useEffect(() => {
    if (!guide || tracked.current) return;
    tracked.current = true;
    track.ridingGuideViewed({ guide_id: guide.id, place_count: guide.stops.length });
  }, [guide]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!guide) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>라이딩 추천을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const openPlace = (stop: RidingGuideStop) => {
    track.ridingGuidePlaceSelected({
      guide_id: guide.id,
      place_source: stop.place.source,
      position: stop.position,
    });
    if (stop.place.source === 'registered') {
      focusPlaceOnMap(stop.place.id, { source: 'riding_guide' });
      return;
    }
    focusPointOnMap({
      name: stop.place.name,
      address: stop.place.address,
      latitude: stop.place.latitude,
      longitude: stop.place.longitude,
      phone: stop.place.phone,
      providerId: stop.place.providerId,
      placeUrl: stop.place.placeUrl,
      generalPlaceId: stop.generalPlaceId,
    });
  };

  const shareGuide = async () => {
    try {
      const url = ridingGuideWebUrl(guide.id);
      await Share.share({ message: `${guide.title}\n${guide.summary}\n${url}`, url });
      track.ridingGuideShared({ guide_id: guide.id });
    } catch {
      toast.error('공유하지 못했습니다.');
    }
  };

  const camera = cameraFor(guide.stops);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {guide.coverImageUrl ? (
        <Image source={guide.coverImageUrl} style={styles.cover} contentFit="cover" />
      ) : null}

      {guide.regions.length > 0 && (
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          {guide.regions.join(' · ')}
        </Text>
      )}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.text }]}>{guide.title}</Text>
        </View>
        <Pressable
          accessibilityLabel="라이딩 추천 공유"
          accessibilityRole="button"
          onPress={shareGuide}
          hitSlop={8}
          style={({ pressed }) => [
            styles.shareButton,
            { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.72 : 1 },
          ]}>
          <Ionicons name="share-outline" size={20} color={colors.tint} />
        </Pressable>
      </View>

      <Text style={[styles.summary, { color: colors.text }]}>{guide.summary}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{guide.description}</Text>

      {guide.tags.length > 0 && (
        <View style={styles.tags}>
          {guide.tags.map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.mapWrap, { borderColor: colors.border }]}>
        <NaverMapView
          style={styles.map}
          mapType="Basic"
          isNightModeEnabled={colorScheme === 'dark'}
          locationOverlay={{ isVisible: false }}
          isShowLocationButton={false}
          isShowCompass={false}
          isShowScaleBar={false}
          isShowZoomControls={false}
          locale="ko"
          initialCamera={camera}>
          {guide.stops.map((stop) => (
            <NaverMapMarkerOverlay
              key={stop.id}
              latitude={stop.place.latitude}
              longitude={stop.place.longitude}
              image={
                stop.place.category
                  ? MARKER_IMAGES_CIRCLE[stop.place.category]
                  : GENERAL_MARKER_CIRCLE
              }
              width={30}
              height={30}
              anchor={{ x: 0.5, y: 0.5 }}
              onTap={() => openPlace(stop)}
            />
          ))}
        </NaverMapView>
      </View>
      <Text style={[styles.mapHint, { color: colors.textSecondary }]}>
        장소 순서는 추천 순서이며 고정 경로나 필수 경유 순서가 아니에요.
      </Text>

      {guide.featuredRoads.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>달리기 좋은 길</Text>
          {guide.featuredRoads.map((road) => (
            <View key={road} style={styles.roadItem}>
              <MaterialCommunityIcons name="road-variant" size={19} color={colors.tint} />
              <Text style={[styles.roadText, { color: colors.text }]}>{road}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>이렇게 들러보세요</Text>
        <View style={styles.placeList}>
          {guide.stops.map((stop) => {
            const category = stop.place.category ? CATEGORIES[stop.place.category] : null;
            return (
              <Pressable
                key={stop.id}
                onPress={() => openPlace(stop)}
                style={({ pressed }) => [
                  styles.placeCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    opacity: pressed ? 0.76 : 1,
                  },
                ]}>
                <View style={styles.placeHeader}>
                  <View style={styles.placeTitleRow}>
                    {stop.role === 'primary' && (
                      <View style={[styles.primaryBadge, { backgroundColor: colors.tint }]}>
                        <Text style={[styles.primaryBadgeText, { color: colors.background }]}>목적지</Text>
                      </View>
                    )}
                    {category && (
                      <Text style={[styles.category, { color: category.color }]}>{category.label}</Text>
                    )}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
                </View>
                <Text style={[styles.placeName, { color: colors.text }]}>{stop.place.name}</Text>
                <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>
                  {stop.place.address}
                </Text>
                {stop.note && (
                  <Text style={[styles.note, { color: colors.textSecondary }]}>{stop.note}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 18, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', aspectRatio: 1.7, borderRadius: 18, marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleCopy: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  title: { fontSize: 24, lineHeight: 31, fontWeight: '900' },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { fontSize: 18, lineHeight: 26, fontWeight: '700', marginTop: 18 },
  description: { fontSize: 15, lineHeight: 24, marginTop: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 18 },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  tagText: { fontSize: 12, fontWeight: '700' },
  mapWrap: { height: 280, borderRadius: 18, overflow: 'hidden', borderWidth: 1, marginTop: 24 },
  map: { flex: 1 },
  mapHint: { fontSize: 12, lineHeight: 18, marginTop: 9 },
  section: { marginTop: 30 },
  sectionTitle: { fontSize: 21, fontWeight: '900', marginBottom: 13 },
  roadItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 10 },
  roadText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  placeList: { gap: 10 },
  placeCard: { borderWidth: 1, borderRadius: 15, padding: 15 },
  placeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  primaryBadgeText: { fontSize: 10, fontWeight: '900' },
  category: { fontSize: 11, fontWeight: '800' },
  placeName: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 8 },
  address: { fontSize: 12, marginTop: 4 },
  note: { fontSize: 14, lineHeight: 20, marginTop: 10 },
});
