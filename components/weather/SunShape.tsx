import { StyleSheet, View } from 'react-native';

export const SUNRISE_SUN_COLOR = '#FBBF24';

export default function SunShape({ color, scale = 1 }: { color: string; scale?: number }) {
  const fill = { backgroundColor: color };
  return (
    <View style={[styles.row, scale !== 1 && { transform: [{ scale }] }]}>
      <View style={[styles.ray, styles.rayL1, fill]} />
      <View style={[styles.ray, styles.rayL2, fill]} />
      <View style={[styles.ray, styles.rayR2, fill]} />
      <View style={[styles.ray, styles.rayR1, fill]} />
      <View style={[styles.sun, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: 34,
    height: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sun: {
    width: 16,
    height: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  ray: {
    position: 'absolute',
    width: 5,
    height: 2,
    borderRadius: 1,
  },
  rayL1: {
    left: 3,
    bottom: 3,
    transform: [{ rotate: '20deg' }],
  },
  rayL2: {
    left: 9,
    bottom: 10,
    transform: [{ rotate: '65deg' }],
  },
  rayR2: {
    right: 9,
    bottom: 10,
    transform: [{ rotate: '-65deg' }],
  },
  rayR1: {
    right: 3,
    bottom: 3,
    transform: [{ rotate: '-20deg' }],
  },
});
