import { withLocationUse } from '@/stores/useLocationPrivacyStore';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import SearchPlaceIcon, { RoutePointIcon } from '@/components/search/SearchPlaceIcon';
import { isFavoritePoint } from '@/lib/favoriteMatching';
import { useFavoritePlaces } from '@/hooks/useFavorites';
import Colors from '@/constants/Colors';
import CloseIcon from '@/components/ui/CloseIcon';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation, useNavLaunching, type NavTarget } from '@/lib/navigation';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import {
  addRecentSearch,
  loadRecentSearches,
  recentKey,
  recentTargets,
  saveRecentSearches,
  type RecentSearch,
} from '@/lib/recentSearches';
import { toast } from '@/lib/toast';

// 출발지·도착지를 자유롭게 정하는 길찾기 페이지.
// 지점을 고르면 미리보기(/navi)로 이동하고, 돌아온 뒤에도 경로 보기로 다시 열 수 있다.
// 집·회사(useMyPlacesStore)와 최근 검색(lib/recentSearches)은 검색 화면과
// 같은 저장소를 그대로 쓴다 — 어느 쪽에서 만들었든 양쪽에 함께 보인다.

// 검색 모달이 어느 값을 채우는 중인지 — 숫자는 경유지 인덱스
type Editing = 'origin' | 'dest' | MyPlaceSlot | number;

// 경유지 상한 — 미리보기(/navi)의 편집 카드와 같은 값
const MAX_VIAS = 3;

export default function DirectionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { data: favorites } = useFavoritePlaces();
  const navLaunching = useNavLaunching((s) => s.launching);
  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  // 장소 상세의 출발/도착 버튼에서 넘어올 때의 프리필
  const params = useLocalSearchParams<{
    olng?: string;
    olat?: string;
    oname?: string;
    dlng?: string;
    dlat?: string;
    dname?: string;
  }>();

  const [origin, setOrigin] = useState<Point>(
    params.olng && params.olat
      ? {
          name: params.oname ?? '출발지',
          longitude: Number(params.olng),
          latitude: Number(params.olat),
        }
      : 'current',
  );
  const [dest, setDest] = useState<Point | null>(
    params.dlng && params.dlat
      ? {
          name: params.dname ?? '도착지',
          longitude: Number(params.dlng),
          latitude: Number(params.dlat),
        }
      : null,
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  // 경유지 — null 은 + 로 만든 빈 줄. 미리보기로 넘어갈 때 채워진 것만 전달한다.
  const [viaPoints, setViaPoints] = useState<(NavTarget | null)[]>([]);
  const [fieldDraftKeys, setFieldDraftKeys] = useState(['origin', 'dest']);
  const nextDraftId = useRef(0);
  const viaCountRef = useRef(viaPoints.length);
  viaCountRef.current = viaPoints.length;
  const [resolving, setResolving] = useState(false);
  const previewPending = useRef(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  // 최근 검색은 검색 화면에서도 바뀌므로 포커스마다 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void loadRecentSearches().then(setRecents);
    }, []),
  );

  const previewBlocked = () => previewPending.current || resolving || navLaunching;
  const editField = (field: Editing) => {
    if (!previewBlocked()) setEditing(field);
  };

  // 두 지점이 갖춰지면 바로 미리보기로. 'current' 는 여기서 좌표로 푼다.
  const preview = async (
    nextOrigin: Point,
    nextDest: Point | null,
    destAddress?: string,
    nextVias: (NavTarget | null)[] = viaPoints,
  ) => {
    if (!nextDest || previewBlocked()) return;
    previewPending.current = true;
    setResolving(true);
    try {
      const resolvedDest = nextDest === 'current' ? await currentAsTarget() : nextDest;
      const resolvedOrigin =
        nextOrigin === 'current' ? undefined : nextOrigin; // undefined → /navi 가 현재 위치 사용
      const vias = nextVias.filter((v): v is NavTarget => v !== null);
      const entered = await openNavigation(resolvedDest, resolvedOrigin, vias);
      if (entered && nextDest !== 'current') {
        // 검색 화면과 같은 최근 검색 목록에 쌓는다
        const next = await addRecentSearch({
          type: 'kakao',
          name: resolvedDest.name,
          address: destAddress ?? '',
          latitude: resolvedDest.latitude,
          longitude: resolvedDest.longitude,
        });
        setRecents(next);
      }
    } catch {
      toast.error('현재 위치를 확인할 수 없습니다');
    } finally {
      previewPending.current = false;
      setResolving(false);
    }
  };

  // 프리필로 도착지까지 들어온 경우 첫 진입에 한 번 자동 실행
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current || !dest) return;
    autoFired.current = true;
    void preview(origin, dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swap = () => {
    if (previewBlocked()) return;
    const nextOrigin: Point = dest ?? 'current';
    const nextDest: Point | null = origin === 'current' ? null : origin;
    const nextVias = [...viaPoints].reverse(); // 왕복 반전이니 들르는 순서도 뒤집는다
    setOrigin(nextOrigin);
    setDest(nextDest);
    setViaPoints(nextVias);
    setFieldDraftKeys((prev) => [...prev].reverse());
    void preview(nextOrigin, nextDest, undefined, nextVias);
  };

  const pickDest = (point: Point, address?: string) => {
    if (previewBlocked()) return;
    setDest(point);
    void preview(origin, point, address);
  };

  // + 버튼 — 빈 경유지 줄만 만든다. 탭해서 검색으로 채운다.
  const addEmptyVia = () => {
    if (previewBlocked()) return;
    if (viaCountRef.current >= MAX_VIAS) return;
    viaCountRef.current += 1;
    const key = `via-${nextDraftId.current++}`;
    setViaPoints((prev) => [...prev, null]);
    setFieldDraftKeys((prev) => [...prev.slice(0, -1), key, prev[prev.length - 1]]);
  };

  const removeVia = (index: number) => {
    if (previewBlocked()) return;
    const removed = viaPoints[index];
    const nextVias = viaPoints.filter((_, i) => i !== index);
    setViaPoints(nextVias);
    setFieldDraftKeys((prev) => prev.filter((_, i) => i !== index + 1));
    // 빈 줄은 경로에 영향이 없다. 채워진 지점 삭제만 현재 목적지로 다시 표시한다.
    if (removed && dest) void preview(origin, dest, undefined, nextVias);
  };

  const handleModalSelect = (point: Point, address?: string) => {
    if (previewBlocked()) return;
    const kind = editing;
    setEditing(null);
    if (typeof kind === 'number') {
      if (point === 'current') return;
      const nextVias = viaPoints.map((v, i) => (i === kind ? point : v));
      setViaPoints(nextVias);
      // 도착지가 이미 있으면 채워진 경유지를 반영해 바로 미리보기로
      if (dest) void preview(origin, dest, undefined, nextVias);
    } else if (kind === 'origin') {
      setOrigin(point);
      void preview(point, dest);
    } else if (kind === 'dest') {
      pickDest(point, address);
    } else if ((kind === 'home' || kind === 'work') && point !== 'current') {
      void saveMyPlace(kind, {
        name: point.name,
        address: address ?? '',
        latitude: point.latitude,
        longitude: point.longitude,
      });
      pickDest(point, address);
    }
  };

  // 집/회사 칩 — 설정돼 있으면 바로 도착지로, 없으면 설정 검색부터
  const shortcut = (slot: MyPlaceSlot) => {
    if (previewBlocked()) return;
    const saved = myPlaces[slot];
    if (saved) {
      pickDest(
        { name: saved.name, latitude: saved.latitude, longitude: saved.longitude },
        saved.address,
      );
    } else {
      editField(slot);
    }
  };

  const label = (p: Point | null, fallback: string) =>
    p === 'current' ? '현재 위치' : (p?.name ?? fallback);

  const busy = resolving || navLaunching;
  const recentRows = recentTargets(recents);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.fieldCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <View style={styles.fieldRows}>
          <FieldRow
            icon="radiobox-marked"
            point={origin === 'current' ? null : origin}
            placeholder="출발지 선택"
            value={label(origin, '')}
            muted={false}
            onPress={() => editField('origin')}
            disabled={busy}
          />
          {viaPoints.map((via, i) => (
            <View key={fieldDraftKeys[i + 1]}>
              <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
              <FieldRow
                icon="circle-medium"
                point={via}
                placeholder="경유지 입력"
                value={via?.name ?? ''}
                muted={!via}
                onPress={() => editField(i)}
                disabled={busy}
                onRemove={() => removeVia(i)}
              />
            </View>
          ))}
          {/* 경유지가 없을 때만 사이에 + 를 띄운다(줄 미차지). 경유지가 생기면
              ⊖ 와의 세로 근접을 피해 + 는 도착지 행 오른쪽 끝으로 옮겨 단다. */}
          <View style={styles.fieldDividerWrap}>
            <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
            {viaPoints.length === 0 && (
              <Pressable
                onPress={addEmptyVia}
                disabled={busy}
                hitSlop={8}
                style={[
                  styles.fieldInsertButton,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          <FieldRow
            icon="map-marker"
            point={dest === 'current' ? null : dest}
            placeholder="도착지 선택"
            value={dest ? label(dest, '') : ''}
            muted={!dest}
            onPress={() => editField('dest')}
            disabled={busy}
            onAdd={
              viaPoints.length > 0 && viaPoints.length < MAX_VIAS ? addEmptyVia : undefined
            }
          />
        </View>
        <View style={styles.fieldSide}>
          <Pressable
            accessibilityLabel="출발지와 도착지 바꾸기"
            disabled={busy}
            accessibilityState={{ disabled: busy }}
            onPress={swap}
            hitSlop={8}
            style={[styles.swapButton, { borderColor: colors.border, opacity: busy ? 0.4 : 1 }]}>
            <MaterialCommunityIcons name="swap-vertical" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityLabel="현재 지점으로 경로 보기"
        accessibilityRole="button"
        accessibilityState={{ disabled: !dest || busy, busy }}
        disabled={!dest || busy}
        onPress={() => { void preview(origin, dest); }}
        style={({ pressed }) => [
          styles.previewButton,
          { backgroundColor: dest ? colors.tint : colors.surface, opacity: pressed ? 0.8 : 1 },
        ]}>
        {busy && <ActivityIndicator size="small" color={colors.background} />}
        <Text style={[styles.previewButtonText, { color: dest ? colors.background : colors.textSecondary }]}>
          경로 보기
        </Text>
      </Pressable>

      {/* 바로가기 — 집·회사 (검색 화면과 같은 저장소) */}
      <View style={styles.shortcutRow}>
        <ShortcutChip
          icon="home"
          text={myPlaces.home ? '집' : '집 설정'}
          set={!!myPlaces.home}
          onPress={() => shortcut('home')}
        />
        <ShortcutChip
          icon="business"
          text={myPlaces.work ? '회사' : '회사 설정'}
          set={!!myPlaces.work}
          onPress={() => shortcut('work')}
        />
      </View>

      {/* 최근 검색 — 좌표 있는 항목만 (검색 화면과 같은 목록) */}
      {recentRows.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: colors.textSecondary }]}>
            최근 검색
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {recentRows.map(({ entry, target }) => (
              <Pressable
                key={recentKey(entry)}
                onPress={() => pickDest(target, target.address)}
                disabled={busy}
                style={[styles.recentRow, { borderBottomColor: colors.border }]}>
                <SearchPlaceIcon point={target} favorite={isFavoritePoint(target, favorites)} size={16}
                  fallback={<Ionicons name="time-outline" size={16} color={colors.textSecondary} />} />
                <View style={styles.recentTexts}>
                  <Text
                    style={[styles.recentName, { color: colors.text }]}
                    numberOfLines={1}>
                    {target.name}
                  </Text>
                  {!!target.address && (
                    <Text
                      style={[styles.recentAddress, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {target.address}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => {
                    const key = recentKey(entry);
                    const next = recents.filter((recent) => recentKey(recent) !== key);
                    setRecents(next);
                    void saveRecentSearches(next);
                  }}
                  hitSlop={10}
                  style={styles.recentRemove}>
                  <CloseIcon size={15} color={colors.textSecondary} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <PointSearchModal
        visible={editing !== null}
        draftKey={editing === 'origin' ? fieldDraftKeys[0]
          : editing === 'dest' ? fieldDraftKeys[fieldDraftKeys.length - 1]
            : typeof editing === 'number' ? fieldDraftKeys[editing + 1] : undefined}
        confirmSlot={editing === 'home' || editing === 'work' ? editing : null}
        allowCurrent={editing === 'origin' || editing === 'dest'}
        allowSaved={editing !== 'home' && editing !== 'work'}
        recents={recentRows.map((r) => r.target)}
        title={
          editing === 'home'
            ? '집 설정'
            : editing === 'work'
              ? '회사 설정'
              : typeof editing === 'number'
                ? viaPoints[editing]
                  ? '경유지 변경'
                  : '경유지 추가'
                : undefined
        }
        onClose={() => setEditing(null)}
        onSelect={handleModalSelect}
      />
    </View>
  );
}

async function currentAsTarget(): Promise<NavTarget> {
  return withLocationUse('route','device',async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('permission');
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { name: '현재 위치', latitude: coords.latitude, longitude: coords.longitude };
  });
}

function FieldRow({
  icon,
  point,
  placeholder,
  value,
  muted,
  onPress,
  onRemove,
  onAdd,
  disabled = false,
}: {
  disabled?: boolean;
  point?: Exclude<Point, 'current'> | null;
  icon: 'radiobox-marked' | 'circle-medium' | 'map-marker';
  placeholder: string;
  value: string;
  muted: boolean;
  onPress: () => void;
  onRemove?: () => void;
  /** 도착지 행 오른쪽 끝의 경유지 추가 버튼 (경유지가 있을 때) */
  onAdd?: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.fieldRow}>
      <RoutePointIcon point={point} icon={icon} size={16} />
      <Text
        style={[styles.fieldValue, { color: muted ? colors.textSecondary : colors.text }]}
        numberOfLines={1}>
        {value || placeholder}
      </Text>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          disabled={disabled}
          hitSlop={8}
          style={[styles.fieldCircleButton, { borderColor: colors.border }]}>
          <MaterialCommunityIcons name="minus" size={14} color={colors.textSecondary} />
        </Pressable>
      )}
      {onAdd && (
        <Pressable
          onPress={onAdd}
          disabled={disabled}
          hitSlop={8}
          style={[styles.fieldCircleButton, { borderColor: colors.border }]}>
          <MaterialCommunityIcons name="plus" size={14} color={colors.textSecondary} />
        </Pressable>
      )}
    </Pressable>
  );
}

function ShortcutChip({
  icon,
  text,
  set,
  onPress,
}: {
  icon: 'home' | 'business';
  text: string;
  set: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.shortcutChip,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <Ionicons
        name={icon}
        size={15}
        color={set ? colors.tint : colors.textSecondary}
      />
      <Text
        style={[
          styles.shortcutText,
          { color: set ? colors.text : colors.textSecondary },
        ]}
        numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  previewButton: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    paddingLeft: 14,
    paddingRight: 10,
  },
  fieldRows: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 26,
  },
  // divider 를 흐름에 그대로 두고 + 버튼만 그 위에 띄운다 — 줄 높이 0
  fieldDividerWrap: {
    justifyContent: 'center',
    zIndex: 5,
  },
  fieldInsertButton: {
    position: 'absolute',
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 행 오른쪽 끝의 ⊖·⊕ — 같은 테두리 원형으로 시각 언어를 맞춘다
  fieldCircleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  fieldValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  fieldSide: {
    width: 42,
    alignItems: 'center',
  },
  swapButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shortcutChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
  },
  shortcutText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  recentSection: {
    flex: 1,
    gap: 4,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTexts: {
    flex: 1,
    gap: 2,
  },
  recentName: {
    fontSize: 15,
  },
  recentAddress: {
    fontSize: 12.5,
  },
  recentRemove: {
    padding: 2,
  },
});
