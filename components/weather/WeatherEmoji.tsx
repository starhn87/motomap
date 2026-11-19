import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';

interface Props {
  emoji: string;
  size: number;
  lineHeight?: number;
}

// Android의 홈·상세·예보에서 같은 그림체와 색을 사용한다.
const androidWeatherIcons: Record<string, {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  label: string;
}> = {
  '☀️': { name: 'weather-sunny', color: '#F59E0B', label: '맑음' },
  '🌙': { name: 'weather-night', color: '#FBBF24', label: '맑은 밤' },
  '⛅': { name: 'weather-partly-cloudy', color: '#738AA7', label: '구름 많음' },
  [NIGHT_PARTLY_CLOUDY_EMOJI]: { name: 'weather-night-partly-cloudy', color: '#738AA7', label: '구름 많은 밤' },
  '☁️': { name: 'weather-cloudy', color: '#738AA7', label: '흐림' },
  '🌧️': { name: 'weather-rainy', color: '#3B82F6', label: '비' },
  '🌨️': { name: 'weather-snowy', color: '#6394C8', label: '눈 또는 비와 눈' },
  '⛈️': { name: 'weather-lightning-rainy', color: '#8B70C1', label: '천둥·번개' },
};

/** 구름 많은 밤에는 기존 시스템 달·구름 이모지를 한 칸 안에 겹쳐 표시한다. */
export default function WeatherEmoji({ emoji, size, lineHeight }: Props) {
  const boxHeight = lineHeight ?? Math.round(size * 1.2);

  const androidIcon = Platform.OS === 'android' ? androidWeatherIcons[emoji] : undefined;
  if (androidIcon) {
    return (
      <View
        accessible
        accessibilityLabel={androidIcon.label}
        pointerEvents="none"
        style={[styles.icon, { width: size, height: boxHeight }]}>
        <MaterialCommunityIcons name={androidIcon.name} color={androidIcon.color} size={size} />
      </View>
    );
  }

  if (emoji !== NIGHT_PARTLY_CLOUDY_EMOJI) {
    return <Text style={{ fontSize: size, lineHeight: boxHeight }}>{emoji}</Text>;
  }

  return (
    <View
      accessible
      accessibilityLabel="구름 많은 밤"
      pointerEvents="none"
      style={{ width: size, height: boxHeight }}>
      <Text
        style={[
          styles.layer,
          {
            left: 0,
            top: (boxHeight - size) / 2 - size * 0.03,
            fontSize: size * 0.38,
            lineHeight: size * 0.46,
          },
        ]}>
        🌙
      </Text>
      <Text
        style={[
          styles.layer,
          {
            right: -size * 0.04,
            bottom: (boxHeight - size) / 2 - size * 0.06,
            fontSize: size * 0.9,
            lineHeight: size,
          },
        ]}>
        ☁️
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
  layer: {
    position: 'absolute',
  },
});
