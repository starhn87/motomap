import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { createAnalyticsId, track } from '@/lib/analytics';

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
    const searchId = createAnalyticsId('search');
    track.searchSubmitted({
      search_id: searchId,
      method: 'voice',
      source: 'map_bar',
      query: q,
    });
    router.push({
      pathname: '/search-results' as any,
      params: { query: q, searchId, source: 'map_bar' },
    });
  });

  return (
    // 검색 진입과 마이크는 형제로 둔다 — 중첩하면 바깥 Pressable이 하나의 접근성 요소로
    // 묶여 스크린리더에서 마이크에 닿을 수 없다.
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}>
      <Pressable
        accessibilityLabel="장소, 라이딩 검색"
        accessibilityRole="button"
        onPress={() => router.push('/search')}
        style={styles.entry}>
        <Ionicons name="search" size={17} color={colors.textSecondary} style={styles.searchIcon} />
        <Text
          style={[styles.placeholder, { color: listening ? colors.tint : colors.textSecondary }]}>
          {listening ? '듣고 있어요…' : '장소, 라이딩 검색'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={listening ? '음성 검색 중지' : '음성 검색'}
        accessibilityRole="button"
        accessibilityState={{ selected: listening }}
        onPress={toggle}
        style={styles.mic}>
        <Ionicons
          name={listening ? 'mic' : 'mic-outline'}
          size={20}
          color={listening ? colors.tint : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // 검색바 전체 높이를 터치 영역으로 쓴다(바깥 패딩은 각 Pressable 안으로 옮김)
  entry: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  placeholder: {
    flex: 1,
    fontSize: 15,
  },
  // 아이콘 20 + 좌우 12 = 폭 44, 높이는 검색바 전체 — 44pt 터치 영역
  mic: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
