import { StyleSheet, Text, View } from 'react-native';

import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';

interface Props {
  emoji: string;
  size: number;
  lineHeight?: number;
}

/** 기존 시스템 이모지 톤을 유지하면서 달과 구름만 자연스럽게 겹쳐 표시한다. */
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
            left: -size * 0.04,
            top: (boxHeight - size) / 2 - size * 0.08,
            fontSize: size * 0.8,
            lineHeight: size * 0.92,
          },
        ]}>
        🌙
      </Text>
      <Text
        style={[
          styles.layer,
          {
            right: -size * 0.03,
            bottom: (boxHeight - size) / 2 - size * 0.07,
            fontSize: size * 0.64,
            lineHeight: size * 0.75,
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
