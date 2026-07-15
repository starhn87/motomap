import { Pressable, Text, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import type { RidingWeather } from '@/lib/api/weather';

interface Props {
  weather: RidingWeather;
  onPress: () => void;
}

// 지도 좌측(카테고리 필터 아래)의 라이딩 날씨 플로팅 버튼 — 상태·기온 요약,
// 테두리 색이 라이딩 적합도 등급을 나타낸다. 탭하면 상세 바텀시트.
export default function WeatherFab({ weather, onPress }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.fab,
        {
          backgroundColor: colors.background,
          borderColor: weather.gradeColor,
        },
      ]}>
      <Text style={styles.emoji}>{weather.current.emoji}</Text>
      <View style={styles.tempWrap}>
        <Text style={[styles.temp, { color: colors.text }]}>{weather.current.temp}°</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 158,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 5,
  },
  emoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  tempWrap: {
    marginTop: -1,
  },
  temp: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
