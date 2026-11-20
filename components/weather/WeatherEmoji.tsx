import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

import { NIGHT_PARTLY_CLOUDY_EMOJI } from '@/constants/weather';

interface Props {
  emoji: string;
  size: number;
  lineHeight?: number;
  homeButton?: boolean;
  roundedSun?: boolean;
}

type WeatherGlyph = {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  size: number;
  x: number;
  y: number;
};

const sun: WeatherGlyph = { name: 'weather-sunny', color: '#F8AF28', size: 1, x: 0, y: 0 };
const moon: WeatherGlyph = { name: 'moon-waxing-crescent', color: '#FBC963', size: 0.86, x: 0.07, y: 0.07 };
const cloudShade: WeatherGlyph = { name: 'cloud', color: '#8CA2BA', size: 0.9, x: 0.06, y: 0.07 };
const cloud: WeatherGlyph = { ...cloudShade, color: '#D8E6F2', x: 0.04, y: 0.01 };
const rain: WeatherGlyph = { name: 'water', color: '#449AF5', size: 0.27, x: 0.24, y: 0.63 };
const snow: WeatherGlyph = { name: 'snowflake', color: '#5295D5', size: 0.3, x: 0.21, y: 0.62 };
const sunRays = [[-4, 0.14], [42, 0.12], [91, 0.13], [137, 0.11],
  [181, 0.12], [222, 0.11], [268, 0.14], [314, 0.12]].map(([angle, length]) => {
  const radians = angle * Math.PI / 180;
  return {
    angle,
    length,
    x: 0.46 + 0.425 * Math.sin(radians),
    y: 0.5 - 0.425 * Math.cos(radians) - length / 2,
  };
});
const cloudWithPrecipitation = [
  { ...cloudShade, y: -0.08 },
  { ...cloud, y: -0.13 },
];
const partlyCloudy = [
  { ...cloudShade, size: 0.74, x: 0.25, y: 0.26 },
  { ...cloud, size: 0.74, x: 0.23, y: 0.21 },
];

// 날씨별 기본 그림과 각 화면에서 공유하는 레이어 배치.
const androidWeatherIcons: Record<string, { label: string; glyphs: WeatherGlyph[] }> = {
  '☀️': { label: '맑음', glyphs: [sun] },
  '🌙': { label: '맑은 밤', glyphs: [moon] },
  '⛅': { label: '구름 많음', glyphs: [{ ...sun, size: 0.65 }, ...partlyCloudy] },
  [NIGHT_PARTLY_CLOUDY_EMOJI]: {
    label: '구름 많은 밤',
    glyphs: [{ ...moon, size: 0.61, x: -0.07 }, ...partlyCloudy],
  },
  '☁️': { label: '흐림', glyphs: [cloudShade, cloud] },
  '🌧️': { label: '비', glyphs: [...cloudWithPrecipitation, rain, { ...rain, x: 0.52, y: 0.7 }] },
  '🌨️': { label: '눈 또는 비와 눈', glyphs: [...cloudWithPrecipitation, snow, { ...snow, x: 0.52, y: 0.68 }] },
  '⛈️': {
    label: '천둥·번개',
    glyphs: [
      { ...cloudWithPrecipitation[0], color: '#657B98' },
      { ...cloudWithPrecipitation[1], color: '#A8BDD3' },
      rain,
      { name: 'lightning-bolt', color: '#F8AF28', size: 0.47, x: 0.42, y: 0.49 },
    ],
  },
};

function RoundedSun({ size, left, top }: { size: number; left: number; top: number }) {
  return (
    <View style={[styles.layer, styles.icon, { left, top, width: size, height: size }]}>
      <View style={[styles.icon, {
        width: size * 0.69, height: size * 0.69, borderRadius: size * 0.345, backgroundColor: '#FFCB6660',
      }]}>
        <View style={{ width: size * 0.55, height: size * 0.55, borderRadius: size * 0.275, backgroundColor: '#FFC54F' }} />
      </View>
      {sunRays.map(ray => (
        <View key={ray.angle} style={[styles.layer, {
          left: size * ray.x,
          top: size * ray.y,
          width: size * 0.08,
          height: size * ray.length,
          borderRadius: size * 0.04,
          backgroundColor: '#F5AA41',
          transform: [{ rotate: `${ray.angle}deg` }],
        }]} />
      ))}
    </View>
  );
}

/** 구름 많은 밤에는 기존 시스템 달·구름 이모지를 한 칸 안에 겹쳐 표시한다. */
export default function WeatherEmoji({ emoji, size, lineHeight, homeButton = false, roundedSun = homeButton }: Props) {
  const boxHeight = lineHeight ?? Math.round(size * 1.2);

  const androidIcon = Platform.OS === 'android' ? androidWeatherIcons[emoji] : undefined;
  if (androidIcon) {
    return (
      <View
        accessible
        accessibilityLabel={androidIcon.label}
        pointerEvents="none"
        style={[styles.icon, { width: size, height: boxHeight }]}>
        <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
          {androidIcon.glyphs.map((glyph, index) => roundedSun && glyph.name === sun.name ? (
            <RoundedSun key={index} size={size * glyph.size} left={size * glyph.x} top={size * glyph.y} />
          ) : (
            <MaterialCommunityIcons
              key={index}
              name={glyph.name}
              color={glyph.color}
              size={size * glyph.size}
              allowFontScaling={false}
              style={[
                styles.layer,
                { left: size * glyph.x, top: size * glyph.y, includeFontPadding: false },
                glyph.name === moon.name && { transform: [{ rotate: '38deg' }, { scale: homeButton ? 1.2 : 1 }] },
              ]}
            />
          ))}
        </View>
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
