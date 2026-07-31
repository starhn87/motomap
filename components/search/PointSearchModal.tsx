import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { CATEGORIES } from '@/constants/categories';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { fetchFavoritePlaces } from '@/lib/api/favorites';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { isSamePlace, searchAll } from '@/lib/api/search';
import type { NavTarget } from '@/lib/navigation';
import type { Place } from '@/types';

/** 길찾기 지점 — 좌표 있는 목적지 또는 '현재 위치' */
export type Point = NavTarget | 'current';

// 검색 화면과 같은 재료: 등록 장소(카테고리 구분)를 앞에, 카카오 일반 장소를
// 뒤에 — 이미 등록된 곳은 일반 목록에서 뺀다.
type ResultItem = { kind: 'place'; place: Place } | { kind: 'kakao'; k: KakaoLocalResult };

// 지점을 고르는 모달. 입력 전에는 현재 위치·집·회사·최근 검색을 보여주고,
// 입력하면 등록 장소 + 카카오 로컬 검색 결과로 바뀐다. 길찾기·미리보기의
// 지점 선택과 집/회사 '설정'(검색·설정 화면)이 함께 쓴다.
export default function PointSearchModal({
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
  const [results, setResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 즐겨찾기에서 고르기 — 별 버튼으로 켜면 제안 자리에 즐겨찾기 목록이 뜬다.
  // 지도 탭과 같은 쿼리 키라 이미 받아둔 목록이 있으면 즉시 보인다.
  const user = useAuthStore((s) => s.user);
  const [showFavList, setShowFavList] = useState(false);
  const { data: favorites } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
    enabled: visible && allowSaved && !!user,
  });
  const favItems = useMemo<ResultItem[]>(
    () => (favorites ?? []).map((place) => ({ kind: 'place' as const, place })),
    [favorites],
  );
  const canShowFav = allowSaved && favItems.length > 0;

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setShowFavList(false);
    }
  }, [visible]);

  const handleChange = (text: string) => {
    setQuery(text);
    if (text.trim()) setShowFavList(false); // 검색을 시작하면 즐겨찾기 목록은 접는다
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [places, kakao] = await Promise.all([
          searchAll(text).then((r) => r.places).catch(() => [] as Place[]),
          searchKakaoLocal(text).catch(() => [] as KakaoLocalResult[]),
        ]);
        const kakaoOnly = kakao.filter(
          (k) =>
            !places.some((p) =>
              isSamePlace(p, { name: k.placeName, latitude: k.latitude, longitude: k.longitude }),
            ),
        );
        setResults([
          ...places.map((place) => ({ kind: 'place' as const, place })),
          ...kakaoOnly.map((k) => ({ kind: 'kakao' as const, k })),
        ]);
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
          {/* 즐겨찾기에서 고르기 — 즐겨찾기가 있을 때만 노출 */}
          {canShowFav && (
            <Pressable onPress={() => setShowFavList((v) => !v)} hitSlop={8}>
              <Ionicons
                name={showFavList ? 'star' : 'star-outline'}
                size={22}
                color={showFavList ? '#FACC15' : colors.textSecondary}
              />
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.modalCancel, { color: colors.text }]}>취소</Text>
          </Pressable>
        </View>

        <FlatList
          data={showFavList ? favItems : results}
          keyExtractor={(item, i) =>
            item.kind === 'place' ? `place-${item.place.id}` : `kakao-${item.k.placeName}-${i}`
          }
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query.trim() || showFavList ? null : (
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
          ListFooterComponent={
            !showFavList && results.some((r) => r.kind === 'kakao') ? (
              <Text style={[styles.kakaoAttribution, { color: colors.textSecondary }]}>
                장소 정보 제공: 카카오
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            item.kind === 'place' ? (
              <Pressable
                onPress={() =>
                  onSelect(
                    {
                      name: item.place.name,
                      latitude: item.place.latitude,
                      longitude: item.place.longitude,
                      // 등록 장소는 id 를 실어 도착 후 리뷰 연결까지 이어지게 한다
                      placeId: item.place.id,
                    },
                    item.place.address,
                  )
                }
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <CategoryIcon category={item.place.category} size={16} />
                <View style={styles.resultTexts}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {item.place.name}
                  </Text>
                  {!!item.place.address && (
                    <Text
                      style={[styles.resultAddress, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {item.place.address}
                    </Text>
                  )}
                </View>
                <Text style={[styles.resultBadge, { color: CATEGORIES[item.place.category].color }]}>
                  {CATEGORIES[item.place.category].label}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() =>
                  onSelect(
                    {
                      name: item.k.placeName,
                      latitude: item.k.latitude,
                      longitude: item.k.longitude,
                    },
                    item.k.roadAddress || item.k.address,
                  )
                }
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                <View style={styles.resultTexts}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {item.k.placeName}
                  </Text>
                  <Text
                    style={[styles.resultAddress, { color: colors.textSecondary }]}
                    numberOfLines={1}>
                    {item.k.roadAddress || item.k.address}
                  </Text>
                </View>
                <Text style={[styles.resultBadge, { color: colors.textSecondary }]}>일반</Text>
              </Pressable>
            )
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  resultBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  kakaoAttribution: {
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
