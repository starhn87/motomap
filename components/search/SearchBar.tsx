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
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { searchAll } from '@/lib/api/search';
import { formatDistance } from '@/constants/course';
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
    },
    [onSelectPlace]
  );

  const handleSelectCourse = useCallback((courseId: string) => {
    setQuery('');
    setIsFocused(false);
    Keyboard.dismiss();
    router.push(`/course/${courseId}`);
  }, []);

  const handleClear = () => {
    setQuery('');
  };

  const showResults = isFocused && query.trim().length >= 2;
  const hasResults = (data?.places.length ?? 0) + (data?.courses.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
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
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Text style={[styles.clearText, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        )}
      </View>

      {showResults && (
        <View
          style={[
            styles.results,
            {
              backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
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
                      onPress={() => handleSelectCourse(course.id)}
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
});
