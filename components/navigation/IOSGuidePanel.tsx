import Ionicons from '@expo/vector-icons/Ionicons';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme,
  type GestureResponderEvent,
} from 'react-native';

type Props = { token: string; menu: boolean };
type Action = 'menu' | 'refresh' | 'recenter' | 'routeEdit' | 'end' | 'volume';
type GuideState = {
  goalName?: string;
  currentLocationName?: string;
  remainingTime?: number;
  remainingDistance?: number;
  status?: string;
  showRecenter?: boolean;
  canRouteEdit?: boolean;
  busy?: boolean;
  volume?: number;
};
type Snapshot = Props & { state: GuideState; expanded: boolean; bottomInset: number };
type PanelEvent = Snapshot | (Props & { toast: string });
type GuideBridge = {
  connectIOSGuidePanel(token: string, menu: boolean): Promise<Snapshot | null>;
  iosGuidePanelRendered(token: string, menu: boolean): Promise<void>;
  iosGuidePanelAction(token: string, action: Action, value: number | null): Promise<void>;
  addListener(event: 'onIOSGuidePanel', listener: (payload: PanelEvent) => void): { remove(): void };
};
const bridge = requireOptionalNativeModule<GuideBridge>('KakaoNavi');

const LIGHT = { ink: '#18181B', bar: '#FAFAFA', sheet: '#FFFFFF', floating: '#FFFFFFCC', line: '#E4E4E7',
  muted: '#71717A', volume: '#1268FA', track: '#E4E4E7', action: '#18181B', onAction: '#FFFFFF', toast: '#18181B' };
const DARK = { ink: '#FAFAFA', bar: '#18181B', sheet: '#0A0A0A', floating: '#0A0A0ACC', line: '#27272A',
  muted: '#A1A1AA', volume: '#3984FF', track: '#3F3F46', action: '#FAFAFA', onAction: '#0A0A0A', toast: '#0A0A0A' };

type GlyphName = 'refresh' | 'menu' | 'goal' | 'position';
const barIcons = {
  refresh: require('@/assets/navigation/guide-refresh.png'),
  menu: require('@/assets/navigation/guide-menu.png'),
};

function Glyph({ name, color, size }: { name: GlyphName; color: string; size: number }) {
  if (name === 'refresh' || name === 'menu') {
    return <Image source={barIcons[name]} style={{ width: size, height: size, tintColor: color }} />;
  }
  return <Ionicons name={name === 'goal' ? 'location-outline' : 'navigate'} size={size} color={color} />;
}

function Control({ label, onPress, disabled, wide, expanded, children }: {
  label: string; onPress: () => void; disabled?: boolean; wide?: boolean; expanded?: boolean; children: ReactNode;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.control, wide && styles.wideControl, (disabled || pressed) && styles.dimmed]}>
    {children}
  </Pressable>;
}

function Volume({ value, tone, onChange }: { value: number; tone: typeof LIGHT; onChange: (value: number) => void }) {
  const width = useRef(0);
  const origin = useRef(0);
  const pending = useRef(value);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const percent = Math.round(shown * 100);
  function update(event: GestureResponderEvent) {
    if (width.current <= 0) return;
    const next = Math.round(Math.max(0, Math.min(1, (event.nativeEvent.pageX - origin.current) / width.current)) * 100) / 100;
    if (next === pending.current) return;
    pending.current = next;
    setDraft(next);
    onChange(next);
  }
  return <>
    <View style={styles.volumeLabel}>
      <Text style={[styles.label, styles.volumeTitle, { color: tone.ink }]}>안내 음량</Text>
      <Text style={[styles.regular, { color: tone.muted }]}>{percent}%</Text>
    </View>
    <View style={styles.volumeRow}>
      <Control label={shown === 0 ? '안내 음량 100%로 켜기' : '안내 음소거'} onPress={() => onChange(shown === 0 ? 1 : 0)}>
        <Ionicons name={shown === 0 ? 'volume-mute-outline' : 'volume-medium-outline'} size={20} color={tone.muted} />
      </Control>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="안내 음량"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => onChange(Math.max(0, Math.min(1, shown + (event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
        onLayout={event => { width.current = event.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={event => {
          origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
          pending.current = value;
          update(event);
        }}
        onResponderMove={update} onResponderRelease={() => setDraft(null)} onResponderTerminate={() => setDraft(null)}
        style={styles.volumeTouch}>
        <View pointerEvents="none" style={[styles.volumeTrack, { backgroundColor: tone.track }]}>
          <View style={[styles.volumeFill, { backgroundColor: tone.volume, width: `${percent}%` }]} />
          <View style={[styles.volumeThumb, { left: `${percent}%` }]} />
        </View>
      </View>
      <Ionicons accessible={false} name="volume-medium-outline" size={18} color={tone.muted} />
    </View>
  </>;
}

function RemainingTime({ seconds, color }: { seconds: number; color: string }) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return <Text numberOfLines={1} maxFontSizeMultiplier={1.15} adjustsFontSizeToFit style={[styles.eta, { color }]}>
    {hours > 0 && <>{hours}<Text style={styles.unit}>시간</Text></>}
    {(hours === 0 || minutes % 60 !== 0) && <>{minutes % 60}<Text style={styles.unit}>분</Text></>}
  </Text>;
}

export default function IOSGuidePanel({ token, menu }: Props) {
  const tone = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState('');
  const [showGoal, setShowGoal] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let receivedState = false;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = bridge.addListener('onIOSGuidePanel', payload => {
      if (payload.token !== token || payload.menu !== menu) return;
      if ('toast' in payload) {
        clearTimeout(toastTimer);
        setToast(payload.toast);
        AccessibilityInfo.announceForAccessibility(payload.toast);
        toastTimer = setTimeout(() => setToast(''), 2200);
      } else {
        receivedState = true;
        setSnapshot(payload);
      }
    });
    void bridge.connectIOSGuidePanel(token, menu).then(payload => {
      if (active && !receivedState && payload) setSnapshot(payload);
    }).catch(() => {});
    return () => {
      active = false;
      clearTimeout(toastTimer);
      subscription.remove();
    };
  }, [token, menu]);

  const expanded = snapshot?.expanded === true;
  useEffect(() => {
    if (menu || expanded) return;
    const timer = setInterval(() => setShowGoal(value => !value), 5000);
    return () => clearInterval(timer);
  }, [menu, expanded]);

  const act = (action: Action, value: number | null = null) => {
    void bridge?.iosGuidePanelAction(token, action, value).catch(() => {});
  };
  const [drag] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (menu ? gesture.dy > 28 : gesture.dy < -28) act('menu');
    },
  }));

  if (!snapshot) return null;
  const { state, bottomInset } = snapshot;
  const location = state.currentLocationName?.trim();
  const displayGoal = showGoal || !location || location === '현재 위치';
  const place = displayGoal ? state.goalName || '목적지' : location;
  const time = state.remainingTime;
  const meters = state.remainingDistance;
  const showMetrics = state.status === undefined && time !== undefined && meters !== undefined && time >= 0 && meters >= 0;
  const editDisabled = !state.canRouteEdit || state.busy;

  return <View style={styles.root} onLayout={event => {
    if (ready.current || event.nativeEvent.layout.width <= 0 || event.nativeEvent.layout.height <= 0) return;
    ready.current = true;
    void bridge?.iosGuidePanelRendered(token, menu).catch(() => {});
  }}>
    {menu ? <View style={[styles.sheet, { backgroundColor: tone.sheet, borderColor: tone.line, paddingBottom: bottomInset + 14 }]}>
      <View {...drag.panHandlers} style={styles.handleTarget}><View style={styles.handle} /></View>
      <ScrollView style={styles.sheetBody} bounces={false}>
        <Volume tone={tone} value={state.volume ?? 1} onChange={value => act('volume', value)} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: editDisabled }} disabled={editDisabled}
          onPress={() => act('routeEdit')} style={({ pressed }) => [styles.action, { borderColor: tone.line }, (pressed || editDisabled) && styles.dimmed]}>
          <Glyph name="goal" size={20} color={tone.ink} /><Text style={[styles.label, { color: tone.ink }]}>목적지 변경</Text>
        </Pressable>
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={() => act('end')}
        style={({ pressed }) => [styles.end, { backgroundColor: tone.action }, pressed && styles.dimmed]}>
        <Ionicons name="navigate-outline" size={18} color={tone.onAction} /><Text style={[styles.label, { color: tone.onAction }]}>길안내 종료</Text>
      </Pressable>
    </View> : <>
      {state.showRecenter && <Pressable accessibilityRole="button" accessibilityLabel="현재 위치로" onPress={() => act('recenter')}
        style={({ pressed }) => [styles.recenter, { backgroundColor: tone.floating, borderColor: tone.line }, pressed && styles.dimmed]}>
        <Glyph name="position" size={20} color={tone.ink} />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} adjustsFontSizeToFit style={[styles.label, { color: tone.ink }]}>현재 위치로</Text>
      </Pressable>}
      <View style={[styles.bar, { backgroundColor: tone.bar, borderColor: tone.line, paddingBottom: bottomInset }]}>
        <Control label="현재 경로 새로고침" onPress={() => act('refresh')} disabled={state.busy}>
          <Glyph name="refresh" size={23} color={tone.ink} />
        </Control>
        <View style={styles.summary} {...drag.panHandlers}>
          <View style={styles.inline}>
            <Glyph name={displayGoal ? 'goal' : 'position'} size={21} color={tone.ink} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} accessibilityLabel={`${displayGoal ? '목적지' : '현재 위치'} ${place}`}
              style={[styles.place, { color: tone.ink }]}>{place}</Text>
          </View>
          <View style={styles.metrics}>
            {showMetrics ? <>
              <RemainingTime seconds={time} color={tone.ink} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.distance, { color: tone.ink }]}>
                {meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`}
              </Text>
            </> : <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.label, { color: tone.ink }]}>{state.status ?? '안내 준비 중'}</Text>}
          </View>
        </View>
        <Control label="길안내 메뉴 열기" wide expanded={expanded} onPress={() => act('menu')}>
          <Glyph name="menu" size={32} color={tone.ink} />
        </Control>
      </View>
    </>}
    {!!toast && <View pointerEvents="none" style={[styles.toast, { backgroundColor: tone.toast }]}>
      <Text style={[styles.label, styles.toastText]}>{toast}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  regular: { fontFamily: 'Pretendard-Regular', fontSize: 12 },
  label: { fontFamily: 'Pretendard-SemiBold', fontSize: 15, flexShrink: 1 },
  control: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  wideControl: { width: 56, height: 56 },
  dimmed: { opacity: 0.45 },
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 68, borderRadius: 16, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 2 },
  summary: { flex: 1, minWidth: 0, justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  place: { fontFamily: 'Pretendard-SemiBold', fontSize: 16, lineHeight: 23, flexShrink: 1 },
  metrics: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  eta: { fontFamily: 'Pretendard-Bold', fontSize: 28, letterSpacing: -0.6, flexShrink: 1 },
  unit: { fontFamily: 'Pretendard-SemiBold', fontSize: 18, letterSpacing: 0 },
  distance: { fontFamily: 'Pretendard-SemiBold', fontSize: 21 },
  recenter: { alignSelf: 'center', width: 132, height: 44, borderRadius: 22, borderWidth: 1, gap: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  sheet: { flex: 1, borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20 },
  sheetBody: { flex: 1 },
  handleTarget: { height: 30, alignItems: 'center', paddingTop: 8 },
  handle: { width: 32, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8' },
  volumeLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  volumeTitle: { fontSize: 13 },
  volumeRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  volumeTouch: { flex: 1, height: 44, justifyContent: 'center' },
  volumeTrack: { height: 5, borderRadius: 3, justifyContent: 'center' },
  volumeFill: { height: 5, borderRadius: 3 },
  volumeThumb: { position: 'absolute', width: 24, height: 24, marginLeft: -12, borderRadius: 12,
    borderWidth: 1, borderColor: '#E4E4E7', backgroundColor: '#FFFFFF', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  action: { marginTop: 12, minHeight: 52, borderRadius: 10, borderWidth: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8 },
  end: { marginTop: 14, minHeight: 48, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  toast: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 68, alignItems: 'center',
    justifyContent: 'center', borderRadius: 16, paddingHorizontal: 16 },
  toastText: { color: '#FAFAFA', textAlign: 'center' },
});
