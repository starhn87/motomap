import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import SearchPlaceIcon from '@/components/search/SearchPlaceIcon';
import MapPickerModal from '@/components/map/MapPickerModal';
import { favoriteMatcher, favoritesFirst, mergeFavoriteCandidates } from '@/lib/favoriteMatching';
import { CATEGORIES } from '@/constants/categories';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { DialogCard } from '@/components/ui/DialogHost';
import type { AppDialog } from '@/lib/dialog';
import { createMyPlaceConfirmation } from '@/lib/myPlaceConfirmation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFavoritePlaces } from '@/hooks/useFavorites';
import type { KakaoLocalResult } from '@/lib/api/kakaoLocal';
import { externalPlaceAttribution, externalPlaceCounts, externalPlaceSource } from '@/lib/api/externalPlaces';
import { getSearchAnchor } from '@/hooks/useSearchAnchor';
import { searchUnifiedPlaces } from '@/lib/api/search';
import type { NavTarget } from '@/lib/navigation';
import type { Place } from '@/types';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { PostHogMaskView } from 'posthog-react-native';

import { createAnalyticsId, track } from '@/lib/analytics';
import { ensureGeneralPlace } from '@/lib/api/generalPlaces';

/** 길찾기 지점 — 좌표 있는 목적지 또는 '현재 위치' */
export type Point = NavTarget | 'current';

// 검색 화면과 같은 재료: 등록 장소(카테고리 구분)를 앞에, 카카오 일반 장소를
// 뒤에 — 이미 등록된 곳은 일반 목록에서 뺀다.
type ResultItem = { kind: 'place'; place: Place } | { kind: 'kakao'; k: KakaoLocalResult };

// 리플레이에서 가릴지를 조건으로 가르는 래퍼. PostHogMaskView 는 무조건 가리므로
// 그대로 쓸 수 없고, 레이아웃이 깨지지 않게 flex 를 이어준다.
function Mask({ masked, children }: { masked: boolean; children: React.ReactNode }) {
  if (!masked) return <>{children}</>;
  return <PostHogMaskView style={{ flex: 1 }}>{children}</PostHogMaskView>;
}

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
  confirmSlot,
  draftKey,
}: {
  visible: boolean;
  allowCurrent: boolean;
  /** 집·회사·최근 검색 제안을 보여줄지 (집/회사 '설정' 모달에서는 숨김) */
  allowSaved?: boolean;
  recents?: (NavTarget & { address?: string })[];
  title?: string;
  onClose: () => void;
  onSelect: (point: Point, address?: string) => void;
  /** 집·회사 설정에만 확인을 요구한다. 일반 출발/도착 선택에는 적용하지 않는다. */
  confirmSlot?: MyPlaceSlot | null;
  /** 지정한 길찾기 행의 입력만 이 모달 인스턴스 안에 보관한다. 영구 저장하지 않는다. */
  draftKey?: string;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const myPlaces = useMyPlacesStore((s) => s.places);
  const [query, setQuery] = useState('');
  const draftQueries = useRef(new Map<string, string>());
  const [selectionConfirmation, setSelectionConfirmation] = useState<AppDialog | null>(null);
  const selectPoint = (point: Point, address?: string) => {
    if (!confirmSlot || point === 'current') {
      onSelect(point, address);
      return;
    }
    Keyboard.dismiss();
    setSelectionConfirmation(createMyPlaceConfirmation(
      confirmSlot,
      { ...point, address: address ?? '' },
      () => {
        setSelectionConfirmation(null);
        onSelect(point, address);
      },
      () => setSelectionConfirmation(null),
    ));
  };
  const closeConfirmation = () => {
    selectionConfirmation?.buttons.find((button) => button.style === 'cancel')?.onPress?.();
  };
  const [results, setResults] = useState<ResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchIssue, setSearchIssue] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const activeSearch = useRef<{ query: string; id: string } | null>(null);

  const getSearchSession = (text: string) => {
    const normalized = text.trim();
    if (activeSearch.current?.query !== normalized) {
      activeSearch.current = { query: normalized, id: createAnalyticsId('search') };
    }
    return activeSearch.current;
  };

  // 즐겨찾기에서 고르기 — 별 버튼으로 켜면 제안 자리에 즐겨찾기 목록이 뜬다.
  // 지도 탭과 같은 쿼리 키라 이미 받아둔 목록이 있으면 즉시 보인다.
  const user = useAuthStore((s) => s.user);
  const [showFavList, setShowFavList] = useState(false);
  const [mapPicking, setMapPicking] = useState(false);
  const { data: favorites } = useFavoritePlaces(visible && allowSaved);
  // 등록 장소와 일반 장소를 함께 보여준다. 일반 즐겨찾기는 모양이 카카오 결과와
  // 같아서(이름·주소·좌표·전화) 그 행을 그대로 재사용한다.
  const favItems = useMemo<ResultItem[]>(
    () => [
      ...(favorites?.places ?? []).map((place) => ({ kind: 'place' as const, place })),
      ...(favorites?.general ?? []).map((f) => ({
        kind: 'kakao' as const,
        k: {
          placeName: f.name,
          address: f.address,
          roadAddress: f.address,
          latitude: f.latitude,
          longitude: f.longitude,
          phone: f.phone ?? '',
          providerId: f.providerId,
          placeUrl: f.placeUrl,
          generalPlaceId: f.generalPlaceId,
        },
      })),
    ],
    [favorites],
  );
  const canShowFav = allowSaved && favItems.length > 0;
  const isFavorite = favoriteMatcher(favorites);
  const candidates = mergeFavoriteCandidates({ places: results.flatMap(item => item.kind === 'place' ? [item.place] : []),
    kakaoOnly: results.flatMap(item => item.kind === 'kakao' ? [item.k] : []) }, favorites, query);
  const rankedResults = favoritesFirst<ResultItem>([...candidates.places.map(place => ({ kind: 'place' as const, place })),
    ...candidates.kakaoOnly.map(k => ({ kind: 'kakao' as const, k }))], isFavorite, item => item.kind === 'place');

  const handleChange = (text: string) => {
    if (visible && draftKey && allowSaved && !confirmSlot) draftQueries.current.set(draftKey, text);
    setQuery(text);
    setSearchIssue(null);
    const sequence = ++requestSequence.current;
    requestAbort.current?.abort();
    if (text.trim()) setShowFavList(false); // 검색을 시작하면 즐겨찾기 목록은 접는다
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) {
      setResults([]);
      setSearching(false);
      activeSearch.current = null;
      return;
    }
    debounce.current = setTimeout(async () => {
      const session = getSearchSession(text);
      setSearching(true);
      const controller = new AbortController();
      requestAbort.current = controller;
      try {
        // 지금 보는 지도(없으면 내 위치) 주변 우선 — 통합 검색과 같은 기준
        const { near } = getSearchAnchor();
        const unified = await searchUnifiedPlaces(text, near, {
          signal: controller.signal,
        });
        const places = unified.places;
        const kakaoOnly = unified.kakaoOnly;
        if (sequence !== requestSequence.current) return;
        setResults([
          ...places.map((place) => ({ kind: 'place' as const, place })),
          ...kakaoOnly.map((k) => ({ kind: 'kakao' as const, k })),
        ]);
        if (unified.failedSources?.some((source) => source !== 'ridingGuides')) {
          setSearchIssue('일부 검색 결과를 불러오지 못했어요. 확인된 결과만 표시해요.');
          return;
        }
        const isMyPlaceSetup = !allowSaved;
        track.searchResultsViewed({
          search_id: session.id,
          source: 'point_modal',
          query: isMyPlaceSetup ? undefined : session.query,
          registered_count: places.length,
          ...externalPlaceCounts(kakaoOnly),
          course_count: 0,
          scope: near ? 'near' : 'all',
        });
        if (places.length === 0) {
          track.searchNoResults({
            search_id: session.id,
            source: 'point_modal',
            query: isMyPlaceSetup ? undefined : session.query,
            ...externalPlaceCounts(kakaoOnly),
          });
        }
      } catch {
        if (controller.signal.aborted) return;
        if (sequence === requestSequence.current) {
          setResults([]);
          setSearchIssue('검색 결과를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
        }
      } finally {
        if (sequence === requestSequence.current) setSearching(false);
      }
    }, 300);
  };

  const selectSearchResult = async (item: ResultItem, rank: number) => {
    const selectionSequence = requestSequence.current;
    const session = activeSearch.current;
    if (session) {
      track.searchResultSelected({
        search_id: session.id,
        result_type: item.kind === 'place' ? 'registered' : externalPlaceSource(item.k),
        rank,
        source: 'point_modal',
      });
    }
    if (item.kind === 'place') {
      selectPoint(
        {
          name: item.place.name,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          placeId: item.place.id,
        },
        item.place.address,
      );
    } else {
      let generalPlaceId = item.k.generalPlaceId;
      if (!generalPlaceId && user && allowSaved) {
        try {
          generalPlaceId = (
            await ensureGeneralPlace({
              name: item.k.placeName,
              address: item.k.roadAddress || item.k.address,
              latitude: item.k.latitude,
              longitude: item.k.longitude,
              phone: item.k.phone || undefined,
              providerId: item.k.providerId,
              placeUrl: item.k.placeUrl,
            })
          ).id;
        } catch {
          // 장소 연결 실패가 지점 선택 자체를 막으면 안 된다.
        }
      }
      // 저장용 장소 연결을 기다리는 동안 다른 필드를 열었다면 이전 선택을 적용하지 않는다.
      if (selectionSequence !== requestSequence.current) return;
      selectPoint(
        {
          name: item.k.placeName,
          latitude: item.k.latitude,
          longitude: item.k.longitude,
          generalPlaceId,
        },
        item.k.roadAddress || item.k.address,
      );
    }
  };

  // 음성 검색 — 인식된 말을 그대로 검색어로 태운다(디바운스·결과 처리는 동일)
  const { listening, toggle: toggleVoice, stop: stopVoice } = useVoiceSearch((text, isFinal) => {
    if (!visible) return;
    handleChange(text);
    // allowSaved 가 false 인 유일한 경우가 집·회사 설정이다(호출부 3곳 확인:
    // search·directions·navi). 민감 장소라 검색어는 계측에 싣지 않는다.
    const isMyPlaceSetup = !allowSaved;
    if (isFinal && text.trim()) {
      const session = getSearchSession(text);
      track.searchSubmitted({
        search_id: session.id,
        method: 'voice',
        source: 'point_modal',
        query: isMyPlaceSetup ? undefined : text.trim(),
      });
    }
  });

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    requestAbort.current?.abort();
    requestSequence.current += 1;
    stopVoice();
    setSelectionConfirmation(null);
    setMapPicking(false);
    setResults([]);
    setShowFavList(false);
    setSearching(false);
    setSearchIssue(null);
    activeSearch.current = null;
    // 결과는 다시 조회해 현재 검색 기준점과 공급자 상태를 반영한다.
    const draft = visible && allowSaved && !confirmSlot && draftKey
      ? draftQueries.current.get(draftKey) ?? ''
      : '';
    handleChange(draft);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      requestAbort.current?.abort();
      requestSequence.current += 1;
    };
    // 입력마다 effect를 재실행하면 타이핑을 지우므로 열림·대상 변경에만 복원한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draftKey, allowSaved, confirmSlot]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={selectionConfirmation ? closeConfirmation : onClose}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1 }} accessibilityElementsHidden={!!selectionConfirmation}
          importantForAccessibility={selectionConfirmation ? 'no-hide-descendants' : 'auto'}>
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
              placeholder={
                listening
                  ? '듣고 있어요…'
                  : title
                    ? `${title}: 장소, 주소 검색`
                    : '장소, 주소 검색'
              }
              placeholderTextColor={listening ? colors.tint : colors.textSecondary}
              accessibilityLabel={title ? `${title}: 장소, 주소 검색` : '장소, 주소 검색'}
              autoFocus
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searching && (
              <ActivityIndicator
                size="small"
                color={colors.textSecondary}
                accessibilityLabel="검색 중"
              />
            )}
            {/* 인식 중에는 숨긴다 — 다음 중간 결과가 어차피 덮어써서 지운 게 무의미하다 */}
            {query.length > 0 && !listening && (
              // 지우면 결과·즐겨찾기 접힘까지 입력과 같은 경로로 되돌린다
              <Pressable
                accessibilityLabel="검색어 지우기"
                accessibilityRole="button"
                onPress={() => handleChange('')}
                style={styles.iconButton}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable
              accessibilityLabel={listening ? '음성 검색 중지' : '음성 검색'}
              accessibilityRole="button"
              accessibilityState={{ selected: listening }}
              onPress={toggleVoice}
              style={[styles.iconButton, styles.iconButtonEnd]}>
              <Ionicons
                name={listening ? 'mic' : 'mic-outline'}
                size={18}
                color={listening ? colors.tint : colors.textSecondary}
              />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}>
            <Text style={[styles.modalCancel, { color: colors.text }]}>취소</Text>
          </Pressable>
        </View>

        {/* 집·회사를 정하는 중이면 결과 목록에 사는 곳 주소가 그대로 뜬다.
            리플레이는 화면을 통째로 찍으므로 목록째 가린다. */}
        {allowSaved && (
          <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); stopVoice(); if (debounce.current) clearTimeout(debounce.current); requestAbort.current?.abort(); requestSequence.current += 1; setSearching(false); setMapPicking(true); }}
            style={[styles.resultRow, { borderBottomColor: colors.border }]}>
            <Ionicons name="map-outline" size={20} color={colors.tint} />
            <Text style={[styles.resultName, { color: colors.text }]}>지도에서 선택</Text>
            <Text style={{ color: colors.textSecondary }}>즐겨찾기 장소도 선택할 수 있어요</Text>
          </Pressable>
        )}
        <MapPickerModal visible={visible && mapPicking} allowFavorites
          initial={getSearchAnchor().near}
          onClose={() => setMapPicking(false)}
          onPick={point => { setMapPicking(false); selectPoint({ name: point.name ?? point.address ?? '지도에서 선택한 위치',
            latitude: point.latitude, longitude: point.longitude, placeId: point.placeId, generalPlaceId: point.generalPlaceId }, point.address ?? undefined); }} />
        <Mask masked={!allowSaved}>
        <FlatList
          data={showFavList ? favItems : rankedResults}
          keyExtractor={(item, i) =>
            item.kind === 'place' ? `place-${item.place.id}` : `kakao-${item.k.generalPlaceId ?? item.k.providerId ?? `${item.k.latitude}:${item.k.longitude}:${item.k.placeName}`}`
          }
          keyboardShouldPersistTaps={confirmSlot ? 'always' : 'handled'}
          ListHeaderComponent={
            query.trim() ? (searchIssue ? (
              <Text style={{ color: colors.textSecondary, padding: 20 }}>{searchIssue}</Text>
            ) : null) : (
              <>
                {/* 바로가기 한 줄 — 현재 위치·집·회사·즐겨찾기.
                    앞의 셋은 누르면 바로 선택되고, 즐겨찾기만 목록을 편다. */}
                <View style={[styles.quickRow, { borderBottomColor: colors.border }]}>
                  {allowCurrent && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.quickItem}
                      onPress={() => selectPoint('current')}>
                      <View style={[styles.quickIcon, { backgroundColor: colors.surfaceMuted }]}>
                        <Ionicons name="locate" size={20} color={colors.tint} />
                      </View>
                      <Text style={[styles.quickLabel, { color: colors.text }]}>현위치</Text>
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
                          accessibilityRole="button"
                          style={styles.quickItem}
                          onPress={() =>
                            selectPoint(
                              {
                                name: saved.name,
                                latitude: saved.latitude,
                                longitude: saved.longitude,
                              },
                              saved.address,
                            )
                          }>
                          <View style={[styles.quickIcon, { backgroundColor: colors.surfaceMuted }]}>
                            <Ionicons name={icon} size={20} color={colors.tint} />
                          </View>
                          {/* 장소명은 민감 정보라 라벨만 보여준다 */}
                          <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  {canShowFav && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: showFavList }}
                      style={styles.quickItem}
                      onPress={() => setShowFavList((v) => !v)}>
                      <View
                        style={[
                          styles.quickIcon,
                          { backgroundColor: showFavList ? '#FACC15' : colors.surfaceMuted },
                        ]}>
                        <Ionicons
                          name={showFavList ? 'star' : 'star-outline'}
                          size={20}
                          color={showFavList ? '#FFFFFF' : colors.tint}
                        />
                      </View>
                      <Text style={[styles.quickLabel, { color: colors.text }]}>즐겨찾기</Text>
                    </Pressable>
                  )}
                </View>
                {allowSaved &&
                  !showFavList &&
                  recents.map((r) => (
                    <Pressable
                      key={`${r.name}-${r.longitude}-${r.latitude}`}
                      accessibilityRole="button"
                      onPress={() =>
                        selectPoint(
                          r,
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
                {externalPlaceAttribution(results.flatMap((r) => r.kind === 'kakao' ? [r.k] : []))}
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            item.kind === 'place' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void selectSearchResult(item, index)}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <SearchPlaceIcon point={item.place} category={item.place.category} favorite={isFavorite(item)} size={16} />
                <View style={styles.resultTexts}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {isFavorite(item) ? '★ ' : ''}{item.place.name}
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
                  {isFavorite(item) ? '즐겨찾기 · ' : ''}{CATEGORIES[item.place.category].label}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void selectSearchResult(item, index)}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}>
                <SearchPlaceIcon point={item.k} favorite={isFavorite(item)} size={16} />
                <View style={styles.resultTexts}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {isFavorite(item) ? '★ 즐겨찾기 · ' : ''}{item.k.placeName}
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
        </Mask>
        </View>
        {selectionConfirmation && (
          <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
            <DialogCard dialog={selectionConfirmation}
              onPress={(button) => button?.onPress?.()} onDismiss={closeConfirmation} />
          </View>
        )}
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
  // 아이콘 18 + 좌우 9 = 폭 36, 높이는 검색바 전체(44) — 터치 영역을 44pt에 맞춘다.
  // 좌우 -4 마진은 박스 gap(8)을 상쇄해(8 − 4 − 4 = 0) 이웃 버튼과 터치 영역이 겹치지 않게
  // 맞닿게 한다. 그 결과 지우기·마이크 아이콘 간격은 기존 8에서 18로 넓어진다.
  iconButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 9,
    marginHorizontal: -4,
  },
  // 마지막 버튼은 박스 오른쪽 패딩(12) 안으로 확장해 아이콘의 오른쪽 여백을 유지한다
  iconButtonEnd: {
    marginRight: -9,
  },
  modalCancel: {
    fontSize: 15,
    fontWeight: '500',
  },
  quickRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 고정 폭 — 집·회사 미설정이나 비로그인으로 항목이 줄어도 왼쪽부터 차곡차곡
  quickItem: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 12,
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
