import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
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
import { toast } from '@/lib/toast';

// 출발지·도착지를 자유롭게 정하는 길찾기 페이지. 지점이 정해지면
// 미리보기(/navi)로 넘어간다 — 날씨·위험 확인은 openNavigation 이 한다.
// '현재 위치'는 경로 보기 시점에 좌표로 풀어낸다.
type Point = NavTarget | 'current';

export default function DirectionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navLaunching = useNavLaunching((s) => s.launching);
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
  const [editing, setEditing] = useState<'origin' | 'dest' | null>(null);
  const [resolving, setResolving] = useState(false);

  const swap = () => {
    const prevOrigin = origin;
    setOrigin(dest ?? 'current');
    setDest(prevOrigin === 'current' ? null : prevOrigin);
  };

  const startPreview = async () => {
    if (!dest || resolving) return;
    setResolving(true);
    try {
      // 'current' 를 좌표로 풀어낸다. 양쪽 다 current 일 수는 없다(도착지 필수).
      let resolvedOrigin: NavTarget | undefined;
      let resolvedDest: NavTarget;
      if (origin === 'current') {
        resolvedOrigin = undefined; // /navi 가 스스로 현재 위치를 잡는다
        resolvedDest = dest === 'current' ? await currentAsTarget() : dest;
      } else {
        resolvedOrigin = origin;
        resolvedDest = dest === 'current' ? await currentAsTarget() : dest;
      }
      await openNavigation(resolvedDest, resolvedOrigin);
    } catch {
      toast.error('현재 위치를 확인할 수 없습니다');
    } finally {
      setResolving(false);
    }
  };

  const label = (p: Point | null, fallback: string) =>
    p === 'current' ? '현재 위치' : (p?.name ?? fallback);

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
        <Pressable
          onPress={swap}
          hitSlop={8}
          style={[styles.swapButton, { borderColor: colors.border }]}>
          <MaterialCommunityIcons name="swap-vertical" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Pressable
        onPress={startPreview}
        disabled={!dest || resolving || navLaunching}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: colors.tint,
            opacity: !dest || resolving || navLaunching ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}>
        {resolving || navLaunching ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={[styles.ctaLabel, { color: colors.background }]}>경로 보기</Text>
        )}
      </Pressable>

      <PointSearchModal
        visible={editing !== null}
        allowCurrent={editing === 'origin'}
        onClose={() => setEditing(null)}
        onSelect={(point) => {
          if (editing === 'origin') setOrigin(point);
          else setDest(point);
          setEditing(null);
        }}
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

// 카카오 로컬 검색으로 지점을 고르는 모달. 출발지에는 '현재 위치' 행이 함께 뜬다.
function PointSearchModal({
  visible,
  allowCurrent,
  onClose,
  onSelect,
}: {
  visible: boolean;
  allowCurrent: boolean;
  onClose: () => void;
  onSelect: (point: Point) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
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
              placeholder="장소, 주소 검색"
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
            allowCurrent ? (
              <Pressable
                onPress={() => onSelect('current')}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <Ionicons name="locate" size={16} color={colors.tint} />
                <Text style={[styles.resultName, { color: colors.text }]}>현재 위치</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                onSelect({
                  name: item.placeName,
                  latitude: item.latitude,
                  longitude: item.longitude,
                })
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
    gap: 16,
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
  swapButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  cta: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '700',
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
