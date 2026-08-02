import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { track } from '@/lib/analytics';

// 지도 위 검색바 모양의 진입 버튼 — 탭하면 검색 전용 화면(/search)으로 전환된다.
// 오른쪽 끝 마이크는 검색 화면을 거치지 않고 여기서 바로 말하기 위한 것.
// 길찾기 진입은 검색바 오른쪽의 독립 버튼이 맡는다(지도 탭).
export default function SearchEntry() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { listening, toggle } = useVoiceSearch((text, isFinal) => {
    if (!isFinal) return;
    const q = text.trim();
    if (q.length < 2) return;
    track.searchSubmitted({ method: 'voice', source: 'map_bar', query: q });
    router.push({ pathname: '/search-results' as any, params: { query: q } });
  });

  return (
    <Pressable
      onPress={() => router.push('/search')}
      style={[
        styles.container,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <Ionicons name="search" size={17} color={colors.textSecondary} style={styles.searchIcon} />
      <Text
        style={[styles.placeholder, { color: listening ? colors.tint : colors.textSecondary }]}>
        {listening ? '듣고 있어요…' : '장소, 코스 검색'}
      </Text>
      <Pressable onPress={toggle} hitSlop={10} style={styles.mic}>
        <Ionicons
          name={listening ? 'mic' : 'mic-outline'}
          size={20}
          color={listening ? colors.tint : colors.textSecondary}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
    fontSize: 15,
  },
  mic: {
    paddingLeft: 8,
  },
});
