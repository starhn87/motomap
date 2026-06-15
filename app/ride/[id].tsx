import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  NaverMapView,
  NaverMapPathOverlay,
} from '@mj-studio/react-native-naver-map';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useRide, useUpdateRideTitle, useDeleteRide } from '@/hooks/useRides';
import {
  formatDistance,
  formatRideDuration,
  formatSpeed,
} from '@/constants/course';
import { toast } from '@/lib/toast';

function formatRideDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: ride, isLoading } = useRide(id ?? null);
  const { mutateAsync: updateTitle, isPending: savingTitle } =
    useUpdateRideTitle(id ?? '');
  const { mutateAsync: removeRide } = useDeleteRide();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>
          주행 기록을 찾을 수 없습니다.
        </Text>
      </View>
    );
  }

  const coords = ride.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const centerLat = coords.length
    ? (Math.max(...lats) + Math.min(...lats)) / 2
    : 37.5665;
  const centerLng = coords.length
    ? (Math.max(...lngs) + Math.min(...lngs)) / 2
    : 126.978;

  const handleSaveTitle = async () => {
    const t = titleDraft.trim();
    if (!t) {
      toast.info('제목을 입력해주세요.');
      return;
    }
    try {
      await updateTitle(t);
      setEditing(false);
    } catch (e: any) {
      toast.error('제목 수정에 실패했습니다.', e.message);
    }
  };

  const handleDelete = () => {
    Alert.alert('주행 기록 삭제', '이 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeRide(ride.id);
            toast.success('삭제되었습니다.');
            router.back();
          } catch (e: any) {
            toast.error('삭제에 실패했습니다.', e.message);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      {coords.length >= 2 && (
        <View style={styles.mapContainer}>
          <NaverMapView
            style={styles.map}
            mapType="Basic"
            isNightModeEnabled={colorScheme === 'dark'}
            isShowLocationButton={false}
            isShowCompass={false}
            isShowScaleBar={false}
            isShowZoomControls={false}
            locale="ko"
            initialCamera={{
              latitude: centerLat,
              longitude: centerLng,
              zoom: 12,
            }}>
            <NaverMapPathOverlay
              coords={coords}
              width={5}
              color="#22C55E"
              outlineWidth={2}
              outlineColor={colors.background}
            />
          </NaverMapView>
        </View>
      )}

      <View style={styles.info}>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              style={[
                styles.titleInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="주행 제목"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <Pressable onPress={() => setEditing(false)} style={styles.editBtn}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                취소
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSaveTitle}
              disabled={savingTitle}
              style={[styles.editBtn, { opacity: savingTitle ? 0.6 : 1 }]}>
              <Text style={{ color: colors.tint, fontWeight: '700' }}>저장</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              {ride.title || formatRideDate(ride.createdAt)}
            </Text>
            <Pressable
              onPress={() => {
                setTitleDraft(ride.title);
                setEditing(true);
              }}>
              <Text style={[styles.editLink, { color: colors.tint }]}>수정</Text>
            </Pressable>
          </View>
        )}
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatRideDate(ride.startedAt ?? ride.createdAt)}
        </Text>

        <View style={styles.statsGrid}>
          <View style={[styles.statCell, { borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDistance(ride.distance)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              거리
            </Text>
          </View>
          <View style={[styles.statCell, { borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatRideDuration(ride.duration)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              시간
            </Text>
          </View>
          <View style={[styles.statCell, { borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatSpeed(ride.avgSpeed)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              평균 속도
            </Text>
          </View>
          <View style={[styles.statCell, { borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatSpeed(ride.maxSpeed)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              최고 속도
            </Text>
          </View>
        </View>

        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>주행 기록 삭제</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { height: 280 },
  map: { flex: 1 },
  info: { padding: 20 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontWeight: '700', flex: 1 },
  editLink: { fontSize: 14, fontWeight: '600', marginLeft: 12 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  editBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  date: { fontSize: 13, marginTop: 6, marginBottom: 20 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCell: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 12 },
  deleteButton: { paddingVertical: 14, alignItems: 'center' },
  deleteText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
