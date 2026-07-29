import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { openNavigation, useNavLaunching, type NavTarget } from '@/lib/navigation';
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
type Point = NavTarget | 'current';

// 검색 모달이 어느 값을 채우는 중인지
type Editing = 'origin' | 'dest' | MyPlaceSlot;

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
  const removeMyPlace = useMyPlacesStore((s) => s.remove);
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
  ) => {
    if (!nextDest || resolving) return;
    setResolving(true);
    try {
      const resolvedDest = nextDest === 'current' ? await currentAsTarget() : nextDest;
      const resolvedOrigin =
        nextOrigin === 'current' ? undefined : nextOrigin; // undefined → /navi 가 현재 위치 사용
      const entered = await openNavigation(resolvedDest, resolvedOrigin);
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
    setOrigin(nextOrigin);
    setDest(nextDest);
    void preview(nextOrigin, nextDest);
  };

  const pickDest = (point: Point, address?: string) => {
    setDest(point);
    void preview(origin, point, address);
  };

  const handleModalSelect = (point: Point, address?: string) => {
    const kind = editing;
    setEditing(null);
    if (kind === 'origin') {
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

  const shortcutLongPress = (slot: MyPlaceSlot) => {
    const label = slot === 'home' ? '집' : '회사';
    const saved = myPlaces[slot];
    if (!saved) return;
    Alert.alert(label, saved.name, [
      { text: '다시 설정', onPress: () => setEditing(slot) },
      { text: '삭제', style: 'destructive', onPress: () => void removeMyPlace(slot) },
      { text: '취소', style: 'cancel' },
    ]);
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
          <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
          <FieldRow
            icon="map-marker"
            placeholder="도착지 선택"
            value={dest ? label(dest, '') : ''}
            muted={!dest}
            onPress={() => setEditing('dest')}
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
          onLongPress={() => shortcutLongPress('home')}
        />
        <ShortcutChip
          icon="business"
          text={myPlaces.work ? '회사' : '회사 설정'}
          set={!!myPlaces.work}
          onPress={() => shortcut('work')}
          onLongPress={() => shortcutLongPress('work')}
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
        allowSaved={editing === 'origin' || editing === 'dest'}
        recents={recentTargets.map((r) => r.target)}
        title={
          editing === 'home' ? '집 설정' : editing === 'work' ? '회사 설정' : undefined
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
}: {
  icon: 'radiobox-marked' | 'map-marker';
  placeholder: string;
  value: string;
  muted: boolean;
  onPress: () => void;
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
    </Pressable>
  );
}

function ShortcutChip({
  icon,
  text,
  set,
  onPress,
  onLongPress,
}: {
  icon: 'home' | 'business';
  text: string;
  set: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
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

// 카카오 로컬 검색으로 지점을 고르는 모달. 입력 전에는 현재 위치·집·회사·
// 최근 검색을 보여주고, 입력하면 검색 결과로 바뀐다.
function PointSearchModal({
  visible,
  allowCurrent,
  allowSaved = false,
  recents = [],
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  allowCurrent: boolean;
  /** 집·회사·최근 검색 제안을 보여줄지 (집/회사 '설정' 모달에서는 숨김) */
  allowSaved?: boolean;
  recents?: (NavTarget & { address?: string })[];
  title?: string;
  onClose: () => void;
  onSelect: (point: Point, address?: string) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const myPlaces = useMyPlacesStore((s) => s.places);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KakaoLocalResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchKakaoLocal(text));
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <View style={styles.modalHeader}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={handleChange}
              placeholder={title ? `${title}: 장소, 주소 검색` : '장소, 주소 검색'}
              placeholderTextColor={colors.textSecondary}
              autoFocus
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searching && <ActivityIndicator size="small" color={colors.textSecondary} />}
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.modalCancel, { color: colors.text }]}>취소</Text>
          </Pressable>
        </View>

        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.placeName}-${i}`}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query.trim() ? null : (
              <>
                {allowCurrent && (
                  <Pressable
                    onPress={() => onSelect('current')}
                    style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name="locate" size={16} color={colors.tint} />
                    <Text style={[styles.resultName, { color: colors.text }]}>현재 위치</Text>
                  </Pressable>
                )}
                {allowSaved &&
                  (
                    [
                      ['home', 'home', '집'],
                      ['work', 'business', '회사'],
                    ] as const
                  ).map(([slot, icon, label]) => {
                    const saved = myPlaces[slot];
                    if (!saved) return null;
                    return (
                      <Pressable
                        key={slot}
                        onPress={() =>
                          onSelect(
                            {
                              name: saved.name,
                              latitude: saved.latitude,
                              longitude: saved.longitude,
                            },
                            saved.address,
                          )
                        }
                        style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                        <Ionicons name={icon} size={16} color={colors.tint} />
                        {/* 장소명은 민감 정보라 라벨만 보여준다 */}
                        <Text style={[styles.resultName, { color: colors.text }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                {allowSaved &&
                  recents.map((r) => (
                    <Pressable
                      key={`${r.name}-${r.longitude}-${r.latitude}`}
                      onPress={() =>
                        onSelect(
                          { name: r.name, latitude: r.latitude, longitude: r.longitude },
                          r.address,
                        )
                      }
                      style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                      <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                      <View style={styles.resultTexts}>
                        <Text
                          style={[styles.resultName, { color: colors.text }]}
                          numberOfLines={1}>
                          {r.name}
                        </Text>
                        {!!r.address && (
                          <Text
                            style={[styles.resultAddress, { color: colors.textSecondary }]}
                            numberOfLines={1}>
                            {r.address}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
              </>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                onSelect(
                  {
                    name: item.placeName,
                    latitude: item.latitude,
                    longitude: item.longitude,
                  },
                  item.roadAddress || item.address,
                )
              }
              style={[styles.resultRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <View style={styles.resultTexts}>
                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                  {item.placeName}
                </Text>
                <Text
                  style={[styles.resultAddress, { color: colors.textSecondary }]}
                  numberOfLines={1}>
                  {item.roadAddress || item.address}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
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
  modal: {
    flex: 1,
    paddingTop: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  modalCancel: {
    fontSize: 15,
    fontWeight: '500',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultTexts: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '500',
  },
  resultAddress: {
    fontSize: 13,
  },
});
