import { StyleSheet, Text, View } from 'react-native';

import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';

interface Props {
  emoji: string;
  size: number;
  lineHeight?: number;
}

/** 구름 많은 밤에는 기존 시스템 달·구름 이모지를 한 칸 안에 겹쳐 표시한다. */
export default function WeatherEmoji({ emoji, size, lineHeight }: Props) {
  const boxHeight = lineHeight ?? Math.round(size * 1.2);

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
  layer: {
    position: 'absolute',
  },
});
