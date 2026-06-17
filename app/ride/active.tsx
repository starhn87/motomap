import { StyleSheet, View, Text, Pressable, Alert } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  NaverMapView,
  NaverMapPathOverlay,
} from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useRideStore, type RideSummary } from '@/stores/useRideStore';
import { useSaveRide } from '@/hooks/useRides';
import {
  formatDistance,
  formatRideDuration,
  formatRideDate,
} from '@/constants/course';
import { toast } from '@/lib/toast';
import RideSummaryModal from '@/components/ride/RideSummaryModal';

const FALLBACK_CENTER = { latitude: 37.5665, longitude: 126.978 };

function defaultRideTitle(): string {
  return formatRideDate(new Date().toISOString()) + ' 주행';
}

export default function ActiveRideScreen() {
  useKeepAwake();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NaverMapViewRef>(null);

  const status = useRideStore((s) => s.status);
  const coordinates = useRideStore((s) => s.coordinates);
  const distanceM = useRideStore((s) => s.distanceM);
  const durationSec = useRideStore((s) => s.durationSec);
  const currentSpeed = useRideStore((s) => s.currentSpeed);

  const { mutateAsync: save, isPending } = useSaveRide();
  const [summary, setSummary] = useState<RideSummary | null>(null);
  const [title, setTitle] = useState('');

  // 진입 시 자동 시작 (idle 일 때만). 권한 거부 시 뒤로.
  useEffect(() => {
    let cancelled = false;
    if (useRideStore.getState().status === 'idle') {
      useRideStore
        .getState()
        .start()
        .then((ok) => {
          if (!ok && !cancelled) router.back();
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // 카메라가 현재 위치(마지막 좌표)를 따라가도록
  const last = coordinates[coordinates.length - 1];
  useEffect(() => {
    if (last) {
      mapRef.current?.animateCameraTo({
        latitude: last.latitude,
        longitude: last.longitude,
        duration: 500,
      });
    }
  }, [last]);

  const handleStop = () => {
    const result = useRideStore.getState().stop();
    if (!result) {
      router.back();
      return;
    }
    if (result.coordinates.length < 2 || result.distanceKm < 0.05) {
      toast.info('기록할 주행 데이터가 부족합니다.');
      useRideStore.getState().reset();
      router.back();
      return;
    }
    setSummary(result);
    setTitle(defaultRideTitle());
  };

  const confirmExit = () => {
    Alert.alert('주행 종료', '주행을 종료하고 기록을 저장할까요?', [
      { text: '계속 주행', style: 'cancel' },
      { text: '종료', style: 'destructive', onPress: handleStop },
    ]);
  };

  const handleSave = async () => {
    if (!summary) return;
    try {
      const saved = await save({
        title: title.trim() || defaultRideTitle(),
        coordinates: summary.coordinates,
        distance: summary.distanceKm,
        duration: summary.durationSec,
        avgSpeed: summary.avgSpeed,
        maxSpeed: summary.maxSpeed,
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
      });
      useRideStore.getState().reset();
      toast.success('주행이 저장되었습니다.');
      router.replace(`/ride/${saved.id}`);
    } catch (e: any) {
      toast.error('저장에 실패했습니다.', e.message);
    }
  };

  const discardSummary = () => {
    Alert.alert('저장하지 않고 나가기', '이 주행 기록이 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          useRideStore.getState().reset();
          setSummary(null);
          router.back();
        },
      },
    ]);
  };

  const isPaused = status === 'paused';
  const initialCenter = last ?? FALLBACK_CENTER;

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        locale="ko"
        initialCamera={{
          latitude: initialCenter.latitude,
          longitude: initialCenter.longitude,
          zoom: 16,
        }}>
        {coordinates.length >= 2 && (
          <NaverMapPathOverlay
            coords={coordinates}
            width={6}
            color="#22C55E"
            outlineWidth={2}
            outlineColor="#FFFFFF"
          />
        )}
      </NaverMapView>

      {/* 상단 닫기 버튼 */}
      <Pressable
        onPress={confirmExit}
        style={[
          styles.closeBtn,
          { top: insets.top + 12, backgroundColor: colors.surfaceElevated },
        ]}>
        <FontAwesome name="times" size={20} color={colors.text} />
      </Pressable>

      {/* 하단 통계 + 컨트롤 패널 */}
      <View
        style={[
          styles.panel,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.surfaceElevated,
            borderTopColor: colors.border,
          },
        ]}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDistance(distanceM / 1000)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              거리
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatRideDuration(durationSec)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              시간
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {currentSpeed > 0 ? currentSpeed.toFixed(0) : '0'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              km/h
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          {isPaused ? (
            <Pressable
              onPress={() => useRideStore.getState().resume()}
              style={[styles.controlBtn, { backgroundColor: '#22C55E' }]}>
              <FontAwesome name="play" size={16} color="#FFFFFF" />
              <Text style={styles.controlText}>재개</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => useRideStore.getState().pause()}
              style={[styles.controlBtn, { backgroundColor: colors.surfaceMuted }]}>
              <FontAwesome name="pause" size={16} color={colors.text} />
              <Text style={[styles.controlText, { color: colors.text }]}>
                일시정지
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={confirmExit}
            style={[styles.controlBtn, { backgroundColor: '#EF4444' }]}>
            <FontAwesome name="stop" size={16} color="#FFFFFF" />
            <Text style={styles.controlText}>종료</Text>
          </Pressable>
        </View>
      </View>

      <RideSummaryModal
        summary={summary}
        title={title}
        onChangeTitle={setTitle}
        onSave={handleSave}
        onDiscard={discardSummary}
        saving={isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: 36 },
  controls: { flexDirection: 'row', gap: 12 },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  controlText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
