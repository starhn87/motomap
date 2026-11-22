import { formatRemainingDistance } from '@/lib/guideDistance';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, PanResponder, Pressable, StyleSheet, Text, View, useColorScheme,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

import { APP_FONT_FAMILY } from '@/lib/typography';

type Traffic = {
  colors: number[];
  fraction: number;
  sampledFraction: number;
  positioned: boolean;
  gpsAvailable?: boolean;
  visible: boolean;
  height: number;
};

type Summary = {
  goalName?: string;
  currentLocationName?: string;
  remainingTime?: number;
  remainingDistance?: number;
  status?: string;
  fullWidthStatus?: string;
  showRecenter?: boolean;
  canRouteEdit?: boolean;
  busy?: boolean;
  volume?: number;
};

type Snapshot = { token: string; state: Summary; expanded: boolean; traffic?: Traffic };
type PanelEvent = Snapshot | { token: string; toast: string };
type Action = 'menu' | 'refresh' | 'recenter' | 'routeEdit' | 'end' | 'volume';
type GuideBridge = {
  connectAndroidGuidePanel(token: string): Promise<Snapshot | null>;
  androidGuidePanelRendered(token: string): Promise<void>;
  androidGuidePanelAction(token: string, action: Action, value: number | null): Promise<void>;
  addListener(event: 'onAndroidGuidePanel', listener: (payload: PanelEvent) => void): { remove(): void };
};
const bridge = requireOptionalNativeModule<GuideBridge>('KakaoNavi');

const INK = '#18181B';
const PAPER = '#FAFAFA';
const LIGHT = { ink: INK, bar: PAPER, sheet: '#FFFFFF', floating: '#FFFFFFCC', line: '#E4E4E7',
  muted: '#71717A', volume: '#1268FA', track: '#E4E4E7', action: INK, onAction: '#FFFFFF' };
const DARK = { ink: PAPER, bar: INK, sheet: '#0A0A0A', floating: '#0A0A0ACC', line: '#27272A',
  muted: '#A1A1AA', volume: '#3984FF', track: '#3F3F46', action: PAPER, onAction: '#0A0A0A' };
const TRACK = '#A1A8B1';
const UNKNOWN = '#B8BBC0';
const MENU_HEIGHT = 238;
const BAR_HEIGHT = 68;
const BAR_INSET = 8;
const ACCENT = '#22C55E';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

function Control({ icon, label, onPress, disabled, expanded, color }: {
  icon: Icon; label: string; onPress: () => void; disabled?: boolean; expanded?: boolean; color: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.control, (disabled || pressed) && styles.dimmed]}>
    {icon === 'refresh'
      ? <MaterialIcons name="refresh" size={26} color={color} />
      : <Ionicons name={icon} size={icon === 'menu' ? 30 : 22} color={color} />}
  </Pressable>;
}

function remainingTime(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` : `${minutes}분`;
}


function colorString(color: number) {
  return `#${(color & 0xFFFFFF).toString(16).padStart(6, '0')}`;
}

function TrafficRail({ traffic, visible }: { traffic: Traffic; visible: boolean }) {
  const progress = useSharedValue(traffic.fraction);
  const opacity = useSharedValue(0);
  const wasPositioned = useRef(false);
  const lastProfile = useRef<Traffic | null>(null);
  const [previous, setPrevious] = useState<Traffic | null>(null);
  const contentHeight = Math.max(0, traffic.height - 22);

  useEffect(() => {
    if (traffic.positioned && wasPositioned.current && visible) {
      progress.value = withTiming(traffic.fraction, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else progress.value = traffic.fraction;
    wasPositioned.current = traffic.positioned;
  }, [progress, traffic.fraction, traffic.positioned, visible]);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 170 });
  }, [opacity, visible]);

  useEffect(() => {
    const old = lastProfile.current;
    lastProfile.current = traffic;
    if (old?.positioned && traffic.positioned && old.sampledFraction > traffic.sampledFraction) {
      setPrevious(old);
    } else if (!traffic.positioned || (old && traffic.sampledFraction > old.sampledFraction)) setPrevious(null);
  }, [traffic]);

  const visibility = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const clip = useAnimatedStyle(() => ({ height: contentHeight * progress.value }));
  const marker = useAnimatedStyle(() => ({ transform: [{ translateY: contentHeight * progress.value }] }));
  const gpsAvailable = traffic.gpsAvailable ?? traffic.positioned;
  const accent = gpsAvailable ? ACCENT : '#A1A1AA';
  const segments = (profile: Traffic) => {
    const height = contentHeight * profile.sampledFraction;
    const step = height / profile.colors.length;
    return <View style={[styles.segments, { height }]}>
      {profile.colors.map((color, index) => {
        const fill = colorString(color);
        return <View key={index} style={[styles.segment, {
          bottom: step * index,
          // 픽셀 반올림으로 인접 구간 사이에 가는 선이 생기지 않게 겹친다.
          height: step + 0.5,
          backgroundColor: fill,
        }]}>
          {fill === '#851f29' && Array.from({ length: Math.ceil(step / 6) }, (_, stripe) => <View
            key={stripe} style={[styles.blockedStripe, { top: stripe * 6 + 1.5 }]} />)}
        </View>;
      })}
    </View>;
  };

  return <Animated.View pointerEvents="none" accessible={visible}
    importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    accessibilityLabel={!gpsAvailable ? '경로 교통 흐름, GPS 수신 대기' :
      traffic.positioned ? '남은 경로 교통 흐름' : '경로 교통 흐름'}
    style={[styles.rail, { height: traffic.height }, visibility]}>
    <View style={[styles.track, { height: contentHeight }]}>
      <Animated.View style={[styles.liveTrack, clip]}>
        {previous && segments(previous)}
        {segments(traffic)}
      </Animated.View>
    </View>
    <Animated.View style={[styles.marker, { borderColor: accent }, marker]}>
      <View style={[styles.arrow, { borderBottomColor: accent }]}>
        <View style={styles.arrowNotch} />
      </View>
    </Animated.View>
  </Animated.View>;
}

function Volume({ value, tone, onChange }: { value: number; tone: typeof LIGHT; onChange: (value: number) => void }) {
  const width = useRef(0);
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef(value);
  const update = (event: GestureResponderEvent) => {
    if (width.current <= 0) return;
    const next = Math.round(Math.max(0, Math.min(1, event.nativeEvent.locationX / width.current)) * 100) / 100;
    if (next === pending.current) return;
    pending.current = next;
    setDraft(next);
    onChange(next);
  };
  const shown = draft ?? value;
  const percent = Math.round(shown * 100);
  return <>
    <View style={styles.volumeLabel}>
      <Text style={[styles.label, { color: tone.ink }]}>안내 음량</Text><Text style={[styles.label, { color: tone.muted }]}>{percent}%</Text>
    </View>
    <View style={styles.volumeRow}>
      <Control color={tone.ink} icon={value === 0 ? 'volume-mute-outline' : 'volume-medium-outline'}
        label={value === 0 ? '안내 음량 100%로 켜기' : '안내 음소거'} onPress={() => onChange(value === 0 ? 1 : 0)} />
      <View accessible accessibilityRole="adjustable" accessibilityLabel="안내 음량"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => onChange(Math.max(0, Math.min(1, value + (event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
        onLayout={event => { width.current = event.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={event => { pending.current = value; update(event); }} onResponderMove={update}
        onResponderRelease={() => setDraft(null)}
        onResponderTerminate={() => setDraft(null)} style={styles.volumeTouch}>
        <View pointerEvents="none" style={[styles.volumeTrack, { backgroundColor: tone.track }]}>
          <View style={[styles.volumeFill, { backgroundColor: tone.volume, width: `${percent}%` }]} />
          <View style={[styles.volumeThumb, { left: `${percent}%` }]} />
        </View>
      </View>
    </View>
  </>;
}

export default function AndroidGuidePanel({ token }: { token: string }) {
  const tone = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState('');
  const [showGoal, setShowGoal] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ready = useRef(false);
  const motion = useSharedValue(0);
  const expanded = snapshot?.expanded === true;

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let receivedState = false;
    const subscription = bridge.addListener('onAndroidGuidePanel', payload => {
      if (payload.token !== token) return;
      if ('toast' in payload) {
        clearTimeout(toastTimer.current);
        setToast(payload.toast);
        toastTimer.current = setTimeout(() => setToast(''), 2200);
      } else {
        receivedState = true;
        setSnapshot(payload);
      }
    });
    void bridge.connectAndroidGuidePanel(token).then(payload => {
      if (active && !receivedState && payload) setSnapshot(payload);
    }).catch(() => {});
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReducedMotion(value);
    }).catch(() => {});
    return () => {
      active = false;
      clearTimeout(toastTimer.current);
      subscription.remove();
      motionSubscription.remove();
    };
  }, [token]);

  useEffect(() => {
    if (expanded) return;
    const timer = setInterval(() => setShowGoal(value => !value), 5000);
    return () => clearInterval(timer);
  }, [expanded]);

  useEffect(() => {
    const duration = reducedMotion ? 0 : expanded ? 220 : 180;
    motion.value = withTiming(expanded ? 1 : 0, { duration, easing: Easing.out(Easing.cubic) });
  }, [expanded, motion, reducedMotion]);

  const backdrop = useAnimatedStyle(() => ({ opacity: motion.value * 0.33 }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - motion.value) * MENU_HEIGHT }] }));
  const act = useCallback((action: Action, value: number | null = null) => {
    void bridge?.androidGuidePanelAction(token, action, value).catch(() => {});
  }, [token]);
  const sheetDrag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (expanded ? gesture.dy > 28 : gesture.dy < -28) act('menu');
    },
  }), [act, expanded]);

  if (!snapshot) return null;
  const state = snapshot.state;
  const showDestination = showGoal || !state.currentLocationName || state.currentLocationName === '현재 위치' || state.status !== undefined;
  const time = state.remainingTime;
  const meters = state.remainingDistance;
  const valid = time !== undefined && meters !== undefined && Number.isFinite(time) && Number.isFinite(meters) && time >= 0 && meters >= 0;

  return <View pointerEvents="box-none" style={styles.root} onLayout={() => {
    if (ready.current) return;
    ready.current = true;
    void bridge?.androidGuidePanelRendered(token).catch(() => {});
  }}>
    {snapshot.traffic && <TrafficRail traffic={snapshot.traffic} visible={snapshot.traffic.visible && !expanded} />}
    {!expanded && state.showRecenter && !state.fullWidthStatus && <Pressable
      accessibilityRole="button" accessibilityLabel="현재 위치로" onPress={() => act('recenter')}
      style={({ pressed }) => [styles.recenter, { backgroundColor: tone.floating, borderColor: tone.line }, pressed && styles.dimmed]}>
      <Ionicons name="navigate" size={19} color={tone.ink} /><Text style={[styles.label, { color: tone.ink }]}>현재 위치로</Text>
    </Pressable>}
    <View pointerEvents={expanded ? 'none' : 'auto'}
      importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
      style={[styles.bar, { backgroundColor: tone.bar, borderColor: tone.line }, expanded && styles.hidden]}>
      {state.fullWidthStatus ? <Text accessibilityLiveRegion="polite" style={[styles.wideStatus, { color: tone.ink }]}>{state.fullWidthStatus}</Text> : <>
        <Control color={tone.ink} icon="refresh" label="현재 경로 새로고침" onPress={() => act('refresh')} disabled={state.busy} />
        <View style={styles.summary} {...sheetDrag.panHandlers}>
          <View style={styles.inline}>
            <Ionicons name={showDestination ? 'location-outline' : 'navigate'} size={20} color={tone.ink} />
            <Text numberOfLines={1} style={[styles.place, { color: tone.ink }]}>{showDestination ? state.goalName ?? '목적지' : state.currentLocationName}</Text>
          </View>
          <View style={[styles.inline, styles.metrics]}>
            <Text numberOfLines={1} style={[valid ? styles.eta : styles.label, { color: tone.ink }]}>
              {valid ? remainingTime(time) : state.status ?? '안내 준비 중'}
            </Text>
            {valid && <Text style={[styles.distance, { color: tone.ink }]}>{formatRemainingDistance(meters)}</Text>}
          </View>
        </View>
        <Control color={tone.ink} icon="menu" label="길안내 메뉴 열기" onPress={() => act('menu')} expanded={false} />
      </>}
    </View>
    {/* 시트와 하단 바를 유지해 전환 프레임에서 뷰를 다시 만들지 않는다. */}
    <View pointerEvents={expanded ? 'box-none' : 'none'}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={styles.menuLayer}>
      <Animated.View style={[styles.backdrop, backdrop]}>
        <Pressable accessibilityRole="button" accessibilityLabel="길안내 메뉴 닫기"
          style={StyleSheet.absoluteFill} onPress={() => act('menu')} />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: tone.sheet, borderColor: tone.line }, sheet]} testID="android-guide-menu">
        <View {...sheetDrag.panHandlers} style={styles.handleTarget}><View style={styles.handle} /></View>
        <Volume tone={tone} value={state.volume ?? 1} onChange={value => act('volume', value)} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !state.canRouteEdit || state.busy }}
          disabled={!state.canRouteEdit || state.busy}
          onPress={() => act('routeEdit')} style={({ pressed }) => [styles.action, { borderColor: tone.line }, (!state.canRouteEdit || state.busy || pressed) && styles.dimmed]}>
          <Ionicons name="location-outline" size={20} color={tone.ink} /><Text style={[styles.label, { color: tone.ink }]}>목적지 변경</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => act('end')} style={({ pressed }) => [styles.end, { backgroundColor: tone.action }, pressed && styles.dimmed]}>
          <Ionicons name="navigate-outline" size={18} color={tone.onAction} /><Text style={[styles.endLabel, { color: tone.onAction }]}>길안내 종료</Text>
        </Pressable>
      </Animated.View>
    </View>
    {!!toast && <View pointerEvents="none" style={[styles.toast, { bottom: expanded ? 0 : 8, left: expanded ? 0 : 12, right: expanded ? 0 : 12 }]}>
      <Text accessibilityLiveRegion="polite" style={styles.endLabel}>{toast}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metrics: { gap: 10 },
  control: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.45 },
  hidden: { opacity: 0 },
  bar: { position: 'absolute', bottom: BAR_INSET, left: 12, right: 12, height: BAR_HEIGHT,
    borderRadius: 16, borderWidth: 1, elevation: 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  summary: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  place: { color: '#52525B', fontFamily: APP_FONT_FAMILY, fontSize: 16, flexShrink: 1 },
  eta: { color: INK, fontFamily: APP_FONT_FAMILY, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  distance: { color: INK, fontFamily: APP_FONT_FAMILY, fontSize: 20, fontWeight: '600' },
  label: { color: INK, fontFamily: APP_FONT_FAMILY, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  wideStatus: { color: INK, fontFamily: APP_FONT_FAMILY, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  recenter: { position: 'absolute', bottom: 84, width: 132, alignSelf: 'center', height: 44, borderRadius: 22, borderWidth: 1,
    backgroundColor: PAPER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingHorizontal: 12, elevation: 3 },
  menuLayer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: MENU_HEIGHT,
    borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20, paddingBottom: 14 },
  handleTarget: { height: 30, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8' },
  volumeLabel: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  volumeRow: { height: 48, flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  volumeTouch: { flex: 1, height: 44, justifyContent: 'center' },
  volumeTrack: { height: 5, borderRadius: 3, backgroundColor: '#D4D4D8', justifyContent: 'center' },
  volumeFill: { height: 5, borderRadius: 3, backgroundColor: '#007AFF' },
  volumeThumb: { position: 'absolute', width: 24, height: 24, marginLeft: -12, borderRadius: 12, backgroundColor: '#FFFFFF', elevation: 2 },
  action: { marginTop: 12, minHeight: 52, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  end: { marginTop: 14, minHeight: 48, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6 },
  endLabel: { color: PAPER, fontFamily: APP_FONT_FAMILY, fontSize: 15, fontWeight: '600' },
  toast: { position: 'absolute', height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, backgroundColor: '#18181B', paddingHorizontal: 16 },
  rail: { position: 'absolute', right: 12, bottom: 92, width: 24, alignItems: 'center' },
  track: { position: 'absolute', top: 11, width: 8, borderRadius: 4, backgroundColor: TRACK,
    borderWidth: 1.5, borderColor: '#FFFFFF', overflow: 'hidden' },
  liveTrack: { backgroundColor: UNKNOWN, overflow: 'hidden' },
  segments: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  segment: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  blockedStripe: { position: 'absolute', left: -1, width: 8, height: 1,
    backgroundColor: '#FFFFFF', transform: [{ rotate: '-31deg' }] },
  marker: { position: 'absolute', top: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 0, height: 0, borderLeftWidth: 5.5, borderRightWidth: 5.5, borderBottomWidth: 8.6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  arrowNotch: { position: 'absolute', top: 6.2, left: -5.5, width: 0, height: 0,
    borderLeftWidth: 5.5, borderRightWidth: 5.5, borderBottomWidth: 2.4,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF' },
});
