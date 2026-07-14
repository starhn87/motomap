import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 지도 위 검색바 모양의 진입 버튼 — 탭하면 검색 전용 화면(/search)으로 전환된다
export default function SearchEntry() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Pressable
      onPress={() => router.push('/search')}
      style={[
        styles.container,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <Text style={styles.searchIcon}>🔍</Text>
      <Text style={[styles.placeholder, { color: colors.textSecondary }]}>장소, 코스 검색</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
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
  placeholder: {
    fontSize: 15,
  },
});
