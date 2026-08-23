import { PixelRatio, StyleSheet, View, type ColorValue } from 'react-native';

interface Props {
  size: number;
  backgroundColor: ColorValue;
}

const MOON_COLOR = '#FBBF24';
const CLOUD_COLOR = '#DCE6F2';

/** 폰트 이모지에 의존하지 않고 달 뒤로 큰 구름이 지나가는 형태를 직접 그린다. */
export default function CloudyNightIcon({ size, backgroundColor }: Props) {
  const px = (ratio: number) => PixelRatio.roundToNearestPixel(size * ratio);
  const moonSize = px(0.52);
  const moonCutoutSize = px(0.47);
  const cloudWidth = px(0.92);
  const cloudHeight = px(0.52);

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View
        style={[
          styles.moon,
          {
            left: px(0.11),
            top: px(0.05),
            width: moonSize,
            height: moonSize,
            borderRadius: moonSize / 2,
            backgroundColor: MOON_COLOR,
          },
        ]}>
        <View
          style={{
            position: 'absolute',
            left: px(0.16),
            top: -px(0.06),
            width: moonCutoutSize,
            height: moonCutoutSize,
            borderRadius: moonCutoutSize / 2,
            backgroundColor,
          }}
        />
      </View>

      <View
        style={[
          styles.cloud,
          {
            left: px(0.04),
            bottom: px(0.04),
            width: cloudWidth,
            height: cloudHeight,
          },
        ]}>
        <View
          style={[
            styles.cloudPiece,
            styles.cloudShadow,
            {
              left: 0,
              bottom: 0,
              width: cloudWidth,
              height: px(0.29),
              borderRadius: px(0.145),
            },
          ]}
        />
        <View
          style={[
            styles.cloudPiece,
            {
              left: px(0.1),
              bottom: px(0.14),
              width: px(0.36),
              height: px(0.36),
              borderRadius: px(0.18),
            },
          ]}
        />
        <View
          style={[
            styles.cloudPiece,
            {
              left: px(0.32),
              bottom: px(0.17),
              width: px(0.44),
              height: px(0.44),
              borderRadius: px(0.22),
            },
          ]}
        />
        <View
          style={[
            styles.cloudPiece,
            {
              left: px(0.61),
              bottom: px(0.13),
              width: px(0.32),
              height: px(0.32),
              borderRadius: px(0.16),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  moon: {
    position: 'absolute',
    overflow: 'hidden',
  },
  cloud: {
    position: 'absolute',
  },
  cloudPiece: {
    position: 'absolute',
    backgroundColor: CLOUD_COLOR,
  },
  cloudShadow: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 1,
    elevation: 1,
  },
});
