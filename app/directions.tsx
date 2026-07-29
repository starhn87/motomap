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

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { openNavigation, useNavLaunching, type NavTarget } from '@/lib/navigation';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import {
  addRecentSearch,
  loadRecentSearches,
  recentKey,
  removeRecentSearch,
  type RecentSearch,
} from '@/lib/recentSearches';
import { toast } from '@/lib/toast';

// 출발지·도착지를 자유롭게 정하는 길찾기 페이지.
// 두 지점이 정해지는 순간 바로 미리보기(/navi)로 넘어간다 — 별도 버튼 없음.
// 집·회사(useMyPlacesStore)와 최근 검색(lib/recentSearches)은 검색 화면과
// 같은 저장소를 그대로 쓴다 — 어느 쪽에서 만들었든 양쪽에 함께 보인다.

// 검색 모달이 어느 값을 채우는 중인지 — 숫자는 경유지 인덱스
type Editing = 'origin' | 'dest' | MyPlaceSlot | number;

// 경유지 상한 — 미리보기(/navi)의 편집 카드와 같은 값
const MAX_VIAS = 5;

// 좌표가 있는 최근 검색만 길찾기 목적지가 될 수 있다 (코스는 제외)
function recentAsTarget(entry: RecentSearch): (NavTarget & { address?: string }) | null {
  if (entry.type === 'place') {
    return {
      name: entry.place.name,
      latitude: entry.place.latitude,
      longitude: entry.place.longitude,
      address: entry.place.address,
    };
  }
  if (entry.type === 'kakao') {
    return {
      name: entry.name,
      latitude: entry.latitude,
      longitude: entry.longitude,
      address: entry.address,
    };
  }
  return null;
}

export default function DirectionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
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
  const [resolving, setResolving] = useState(false);
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

  // 두 지점이 갖춰지면 바로 미리보기로. 'current' 는 여기서 좌표로 푼다.
  const preview = async (
    nextOrigin: Point,
    nextDest: Point | null,
    destAddress?: string,
    nextVias: (NavTarget | null)[] = viaPoints,
  ) => {
    if (!nextDest || resolving) return;
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
    const nextOrigin: Point = dest ?? 'current';
    const nextDest: Point | null = origin === 'current' ? null : origin;
    const nextVias = [...viaPoints].reverse(); // 왕복 반전이니 들르는 순서도 뒤집는다
    setOrigin(nextOrigin);
    setDest(nextDest);
    setViaPoints(nextVias);
    void preview(nextOrigin, nextDest, undefined, nextVias);
  };

  const pickDest = (point: Point, address?: string) => {
    setDest(point);
    void preview(origin, point, address);
  };

  // + 버튼 — 빈 경유지 줄만 만든다. 탭해서 검색으로 채운다.
  const addEmptyVia = () => {
    setViaPoints((prev) => (prev.length >= MAX_VIAS ? prev : [...prev, null]));
  };

  const removeVia = (index: number) => {
    setViaPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleModalSelect = (point: Point, address?: string) => {
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
    const saved = myPlaces[slot];
    if (saved) {
      pickDest(
        { name: saved.name, latitude: saved.latitude, longitude: saved.longitude },
        saved.address,
      );
    } else {
      setEditing(slot);
    }
  };

  const label = (p: Point | null, fallback: string) =>
    p === 'current' ? '현재 위치' : (p?.name ?? fallback);

  const busy = resolving || navLaunching;
  // 같은 장소가 등록 장소(place)와 카카오 검색(kakao) 두 형태로 쌓일 수 있어
  // 이름+좌표(±10m)로 합친다 — 먼저 온(최신) 항목이 남는다.
  const seenRecent = new Set<string>();
  const recentTargets = recents
    .map((entry) => ({ entry, target: recentAsTarget(entry) }))
    .filter((r): r is { entry: RecentSearch; target: NavTarget & { address?: string } } =>
      r.target !== null,
    )
    .filter(({ target }) => {
      const key = `${target.name}|${target.latitude.toFixed(4)},${target.longitude.toFixed(4)}`;
      if (seenRecent.has(key)) return false;
      seenRecent.add(key);
      return true;
    });

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
            placeholder="출발지 선택"
            value={label(origin, '')}
            muted={false}
            onPress={() => setEditing('origin')}
          />
          {viaPoints.map((via, i) => (
            <View key={i}>
              <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
              <FieldRow
                icon="circle-medium"
                placeholder="경유지 입력"
                value={via?.name ?? ''}
                muted={!via}
                onPress={() => setEditing(i)}
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
            placeholder="도착지 선택"
            value={dest ? label(dest, '') : ''}
            muted={!dest}
            onPress={() => setEditing('dest')}
            onAdd={
              viaPoints.length > 0 && viaPoints.length < MAX_VIAS ? addEmptyVia : undefined
            }
          />
        </View>
        <View style={styles.fieldSide}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Pressable
              onPress={swap}
              hitSlop={8}
              style={[styles.swapButton, { borderColor: colors.border }]}>
              <MaterialCommunityIcons
                name="swap-vertical"
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>

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
      {recentTargets.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={[styles.recentTitle, { color: colors.textSecondary }]}>
            최근 검색
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {recentTargets.map(({ entry, target }) => (
              <Pressable
                key={recentKey(entry)}
                onPress={() => pickDest(target, target.address)}
                style={[styles.recentRow, { borderBottomColor: colors.border }]}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
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
                    void removeRecentSearch(recentKey(entry)).then(setRecents);
                  }}
                  hitSlop={10}
                  style={styles.recentRemove}>
                  <Ionicons name="close" size={15} color={colors.textSecondary} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <PointSearchModal
        visible={editing !== null}
        allowCurrent={editing === 'origin' || editing === 'dest'}
        allowSaved={editing !== 'home' && editing !== 'work'}
        recents={recentTargets.map((r) => r.target)}
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
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('permission');
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { name: '현재 위치', latitude: coords.latitude, longitude: coords.longitude };
}

function FieldRow({
  icon,
  placeholder,
  value,
  muted,
  onPress,
  onRemove,
  onAdd,
}: {
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
    <Pressable onPress={onPress} style={styles.fieldRow}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.textSecondary} />
      <Text
        style={[styles.fieldValue, { color: muted ? colors.textSecondary : colors.text }]}
        numberOfLines={1}>
        {value || placeholder}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={10} style={styles.fieldRemove}>
          <MaterialCommunityIcons
            name="minus-circle-outline"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      )}
      {onAdd && (
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          style={[styles.fieldAddButton, { borderColor: colors.border }]}>
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
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldAddButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRemove: {
    padding: 2,
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
