import { Text, View, type ColorValue } from 'react-native';

import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';
import CloudyNightIcon from '@/components/weather/CloudyNightIcon';

interface Props {
  emoji: string;
  size: number;
  lineHeight?: number;
  backgroundColor: ColorValue;
}

/** 일반 상태는 시스템 이모지를, 구름 많은 밤은 직접 그린 전용 아이콘을 표시한다. */
export default function WeatherEmoji({ emoji, size, lineHeight, backgroundColor }: Props) {
  const boxHeight = lineHeight ?? Math.round(size * 1.2);

  if (emoji !== NIGHT_PARTLY_CLOUDY_EMOJI) {
    return <Text style={{ fontSize: size, lineHeight: boxHeight }}>{emoji}</Text>;
  }

  return (
    <View
      accessible
      accessibilityLabel="구름 많은 밤"
      pointerEvents="none"
      style={{ width: size, height: boxHeight, alignItems: 'center', justifyContent: 'center' }}>
      <CloudyNightIcon size={size} backgroundColor={backgroundColor} />
    </View>
  );
}
