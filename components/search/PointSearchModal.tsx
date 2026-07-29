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
import { useEffect, useRef, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';
import type { NavTarget } from '@/lib/navigation';

/** 길찾기 지점 — 좌표 있는 목적지 또는 '현재 위치' */
export type Point = NavTarget | 'current';

// 카카오 로컬 검색으로 지점을 고르는 모달. 입력 전에는 현재 위치·집·회사·
// 최근 검색을 보여주고, 입력하면 검색 결과로 바뀐다. 길찾기의 출발지·도착지
// 선택과 집/회사 '설정'(검색·설정 화면)이 함께 쓴다.
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
