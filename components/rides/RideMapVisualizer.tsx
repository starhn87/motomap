import Ionicons from '@expo/vector-icons/Ionicons';
import {
  NaverMapMarkerOverlay,
  NaverMapPathOverlay,
  NaverMapView,
  type NaverMapViewRef,
  type Rect,
  type Region,
} from '@mj-studio/react-native-naver-map';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { RideSession } from '@/lib/api/rideSessions';
import { ridePathBounds } from '@/lib/ridePath';
import {
  activeRidePlaybackEntry,
  buildRidePlaybackTimeline,
  ridePlaybackPoint,
  ridePlaybackProgress,
} from '@/lib/ridePlayback';

interface Props {
  sessions: RideSession[];
  style?: StyleProp<ViewStyle>;
  mapPadding?: Partial<Rect>;
  onSessionPress?: (sessionId: string) => void;
}

const ROUTE_COLOR = 'rgba(37, 99, 235, 0.40)';
const ROUTE_OUTLINE = 'rgba(255, 255, 255, 0.55)';
const HIDDEN_ROUTE = 'rgba(37, 99, 235, 0)';
const CAMERA_FOLLOW_INTERVAL_MS = 650;

function initialCamera(sessions: RideSession[]) {
  const bounds = ridePathBounds(sessions.flatMap((session) => session.pathSegments));
  if (!bounds) return { latitude: 37.5665, longitude: 126.978, zoom: 10 };
  const latitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const longitude = (bounds.minLongitude + bounds.maxLongitude) / 2;
  const span = Math.max(
    bounds.maxLatitude - bounds.minLatitude,
    (bounds.maxLongitude - bounds.minLongitude) * 0.8,
    0.002,
  );
  return {
    latitude,
    longitude,
    zoom: Math.min(15, Math.max(6, Math.log2(180 / span) - 0.8)),
  };
}

function isInsideSafeRegion(
  point: { latitude: number; longitude: number },
  region: Region | null,
): boolean {
  if (!region) return false;
  const horizontalPadding = region.longitudeDelta * 0.2;
  const verticalPadding = region.latitudeDelta * 0.2;
  return point.longitude >= region.longitude + horizontalPadding
    && point.longitude <= region.longitude + region.longitudeDelta - horizontalPadding
    && point.latitude >= region.latitude + verticalPadding
    && point.latitude <= region.latitude + region.latitudeDelta - verticalPadding;
}

export default function RideMapVisualizer({
  sessions,
  style,
  mapPadding,
  onSessionPress,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const mapRef = useRef<NaverMapViewRef>(null);
  const regionRef = useRef<Region | null>(null);
  const followCameraRef = useRef(true);
  const lastCameraMoveRef = useRef(0);
  const progressWidthRef = useRef(1);
  const timeline = useMemo(() => buildRidePlaybackTimeline(sessions), [sessions]);
  const camera = useMemo(() => initialCamera(sessions), [sessions]);
  const [elapsedMs, setElapsedMs] = useState(timeline.durationMs);
  const elapsedRef = useRef(elapsedMs);
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  useEffect(() => {
    elapsedRef.current = timeline.durationMs;
    setElapsedMs(timeline.durationMs);
    setPlaying(false);
    setHasPlayed(false);
    followCameraRef.current = true;
    const bounds = ridePathBounds(sessions.flatMap((session) => session.pathSegments));
    if (!bounds) return;
    const timer = setTimeout(() => {
      if (
        bounds.minLatitude === bounds.maxLatitude
        && bounds.minLongitude === bounds.maxLongitude
      ) {
        mapRef.current?.animateCameraTo({
          latitude: bounds.minLatitude,
          longitude: bounds.minLongitude,
          zoom: 14,
          duration: 0,
        });
      } else {
        mapRef.current?.animateCameraWithTwoCoords({
          coord1: { latitude: bounds.minLatitude, longitude: bounds.minLongitude },
          coord2: { latitude: bounds.maxLatitude, longitude: bounds.maxLongitude },
          duration: 0,
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [sessions, timeline.durationMs]);

  useEffect(() => {
    if (!playing || timeline.durationMs <= 0) return;
    let lastTick = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const next = Math.min(
        timeline.durationMs,
        elapsedRef.current + (now - lastTick) * speed,
      );
      lastTick = now;
      elapsedRef.current = next;
      setElapsedMs(next);
      if (next >= timeline.durationMs) setPlaying(false);
    }, 100);
    return () => clearInterval(timer);
  }, [playing, speed, timeline.durationMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPlaying(false);
    });
    return () => subscription.remove();
  }, []);

  const activeEntry = activeRidePlaybackEntry(timeline, elapsedMs);
  const activeProgress = activeEntry ? ridePlaybackProgress(activeEntry, elapsedMs) : 0;
  const activePoint = hasPlayed && activeEntry
    ? ridePlaybackPoint(activeEntry, activeProgress)
    : null;

  useEffect(() => {
    if (!activePoint || !followCameraRef.current) return;
    if (isInsideSafeRegion(activePoint, regionRef.current)) return;
    const now = Date.now();
    if (now - lastCameraMoveRef.current < CAMERA_FOLLOW_INTERVAL_MS) return;
    lastCameraMoveRef.current = now;
    mapRef.current?.animateCameraTo({ ...activePoint, duration: 350 });
  }, [activePoint]);

  const togglePlayback = () => {
    followCameraRef.current = true;
    setHasPlayed(true);
    if (elapsedRef.current >= timeline.durationMs) {
      elapsedRef.current = 0;
      setElapsedMs(0);
    }
    setPlaying((current) => !current);
  };

  const seek = (locationX: number) => {
    followCameraRef.current = true;
    setHasPlayed(true);
    const next = timeline.durationMs * Math.max(0, Math.min(1, locationX / progressWidthRef.current));
    elapsedRef.current = next;
    setElapsedMs(next);
    setPlaying(false);
  };

  const cycleSpeed = () => setSpeed((current) => current === 1 ? 2 : current === 2 ? 4 : 1);
  const overallProgress = timeline.durationMs > 0 ? elapsedMs / timeline.durationMs : 1;

  return (
    <View style={[styles.container, style]}>
      <NaverMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowZoomControls={false}
        locationOverlay={{ isVisible: false }}
        locale="ko"
        initialCamera={camera}
        mapPadding={{ bottom: 82, ...mapPadding }}
        onCameraChanged={({ region, reason }) => {
          regionRef.current = region;
          if (reason === 'Gesture') followCameraRef.current = false;
        }}>
        {timeline.entries.map((entry) => {
          const progress = ridePlaybackProgress(entry, elapsedMs);
          return (
            <NaverMapPathOverlay
              key={entry.key}
              coords={entry.coords}
              width={6}
              outlineWidth={1}
              progress={progress}
              color={HIDDEN_ROUTE}
              outlineColor="rgba(255,255,255,0)"
              passedColor={ROUTE_COLOR}
              passedOutlineColor={ROUTE_OUTLINE}
              onTap={() => onSessionPress?.(entry.sessionId)}
            />
          );
        })}
        {activePoint ? (
          <NaverMapMarkerOverlay
            latitude={activePoint.latitude}
            longitude={activePoint.longitude}
            image={require('@/assets/images/markers/user_location.png')}
            width={34}
            height={34}
            anchor={{ x: 0.5, y: 0.5 }}
            globalZIndex={100_000}
          />
        ) : null}
      </NaverMapView>

      <View
        style={[
          styles.controls,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}>
        <Pressable
          accessibilityLabel={playing ? '라이딩 지도 일시정지' : '라이딩 지도 재생'}
          onPress={togglePlayback}
          style={({ pressed }) => [
            styles.playButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={19}
            color={colors.background}
          />
        </Pressable>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="라이딩 지도 재생 위치"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(overallProgress * 100) }}
          onLayout={(event) => {
            progressWidthRef.current = Math.max(1, event.nativeEvent.layout.width);
          }}
          onPress={(event) => seek(event.nativeEvent.locationX)}
          style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: '#2563EB', width: `${overallProgress * 100}%` },
            ]}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`재생 속도 ${speed}배`}
          onPress={cycleSpeed}
          style={({ pressed }) => [styles.speedButton, pressed && { opacity: 0.55 }]}>
          <Text style={[styles.speedText, { color: colors.text }]}>{speed}×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 280,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  speedButton: {
    minWidth: 34,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
