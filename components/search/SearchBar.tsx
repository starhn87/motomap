import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { searchAll } from '@/lib/api/search';
import { formatDistance } from '@/constants/course';
import {
  loadRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  recentKey,
  type RecentSearch,
} from '@/lib/recentSearches';
import type { Place } from '@/types';

interface Props {
  onSelectPlace: (place: Place) => void;
  onDismiss?: () => void;
}

export default function SearchBar({ onSelectPlace, onDismiss }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    loadRecentSearches().then(setRecent);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchAll(query),
    enabled: query.trim().length >= 2,
  });

  const handleSelectPlace = useCallback(
    (place: Place) => {
      setQuery('');
      setIsFocused(false);
      Keyboard.dismiss();
      onSelectPlace(place);
      addRecentSearch({ type: 'place', place }).then(setRecent);
    },
    [onSelectPlace]
  );

  const handleSelectCourse = useCallback((courseId: string, courseName: string) => {
    setQuery('');
    setIsFocused(false);
    Keyboard.dismiss();
    router.push(`/course/${courseId}`);
    addRecentSearch({ type: 'course', id: courseId, name: courseName }).then(setRecent);
  }, []);

  const handleClear = () => {
    setQuery('');
  };

  const showResults = isFocused && query.trim().length >= 2;
  const hasResults = (data?.places.length ?? 0) + (data?.courses.length ?? 0) > 0;
  const showRecent = isFocused && query.trim().length < 2 && recent.length > 0;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: isFocused ? colors.tint : colors.border,
          },
        ]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="장소, 코스 검색"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Text style={[styles.clearText, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        )}
      </View>

      {showRecent && (
        <View
          style={[
            styles.results,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}>
          <View style={[styles.recentHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.recentTitle, { color: colors.textSecondary }]}>최근 검색</Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setRecent([]);
                clearRecentSearches();
              }}>
              <Text style={[styles.recentClear, { color: colors.textSecondary }]}>지우기</Text>
            </Pressable>
          </View>
          {recent.map((entry) => {
            const key = recentKey(entry);
            const isPlace = entry.type === 'place';
            const icon = isPlace ? CATEGORIES[entry.place.category].icon : '🛣️';
            const name = isPlace ? entry.place.name : entry.name;
            return (
              <Pressable
                key={key}
                onPress={() =>
                  isPlace ? handleSelectPlace(entry.place) : handleSelectCourse(entry.id, entry.name)
                }
                style={({ pressed }) => [
                  styles.resultItem,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Text style={styles.resultIcon}>{icon}</Text>
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => removeRecentSearch(key).then(setRecent)}
                  style={styles.recentRemove}>
                  <Text style={[styles.recentRemoveText, { color: colors.textSecondary }]}>✕</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      {showResults && (
        <View
          style={[
            styles.results,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.tint} style={{ padding: 16 }} />
          ) : !hasResults ? (
            <Text style={[styles.noResult, { color: colors.textSecondary }]}>
              검색 결과가 없습니다
            </Text>
          ) : (
            <FlatList
              data={[
                ...(data?.places.map((p) => ({ type: 'place' as const, data: p })) ?? []),
                ...(data?.courses.map((c) => ({ type: 'course' as const, data: c })) ?? []),
              ]}
              keyExtractor={(item) => `${item.type}-${item.data.id}`}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.resultList}
              renderItem={({ item }) => {
                if (item.type === 'place') {
                  const place = item.data as Place;
                  const cat = CATEGORIES[place.category];
                  return (
                    <Pressable
                      onPress={() => handleSelectPlace(place)}
                      style={({ pressed }) => [
                        styles.resultItem,
                        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <Text style={styles.resultIcon}>{cat.icon}</Text>
                      <View style={styles.resultInfo}>
                        <Text style={[styles.resultName, { color: colors.text }]}>
                          {place.name}
                        </Text>
                        <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
                          {place.address}
                        </Text>
                      </View>
                      <Text style={[styles.resultBadge, { color: cat.color }]}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                } else {
                  const course = item.data;
                  return (
                    <Pressable
                      onPress={() => handleSelectCourse(course.id, course.name)}
                      style={({ pressed }) => [
                        styles.resultItem,
                        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <Text style={styles.resultIcon}>🛣️</Text>
                      <View style={styles.resultInfo}>
                        <Text style={[styles.resultName, { color: colors.text }]}>
                          {course.name}
                        </Text>
                        <Text style={[styles.resultSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          {course.description}
                        </Text>
                      </View>
                      {course.distance > 0 && (
                        <Text style={[styles.resultBadge, { color: colors.textSecondary }]}>
                          {formatDistance(course.distance)}
                        </Text>
                      )}
                    </Pressable>
                  );
                }
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  clearButton: {
    padding: 4,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
  },
  results: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  resultList: {
    maxHeight: 296,
  },
  noResult: {
    padding: 16,
    textAlign: 'center',
    fontSize: 13,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  resultIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  resultSub: {
    fontSize: 12,
  },
  resultBadge: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  recentClear: {
    fontSize: 12,
  },
  recentRemove: {
    padding: 4,
    marginLeft: 8,
  },
  recentRemoveText: {
    fontSize: 13,
  },
});
