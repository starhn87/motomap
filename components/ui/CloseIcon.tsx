import { PixelRatio, StyleSheet, View, type ColorValue, type ViewStyle } from 'react-native';

interface Props {
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}

/** 폰트 글리프 여백 없이 버튼 영역을 충분히 채우는 공용 닫기 아이콘. */
export default function CloseIcon({ size = 24, color, strokeWidth }: Props) {
  const lineLength = PixelRatio.roundToNearestPixel(size * 1.03);
  const lineThickness = PixelRatio.roundToNearestPixel(
    strokeWidth ?? Math.max(1.5, size * 0.09),
  );
  const lineStyle: ViewStyle = {
    width: lineLength,
    height: lineThickness,
    left: (size - lineLength) / 2,
    top: (size - lineThickness) / 2,
    borderRadius: lineThickness / 2,
    backgroundColor: color,
  };

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View style={[styles.line, lineStyle, styles.forwardSlash]} />
      <View style={[styles.line, lineStyle, styles.backSlash]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
  },
  forwardSlash: {
    transform: [{ rotate: '45deg' }],
  },
  backSlash: {
    transform: [{ rotate: '-45deg' }],
  },
});
