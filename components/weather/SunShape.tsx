import { StyleSheet, View } from 'react-native';

export const SUNRISE_SUN_COLOR = '#FBBF24';
const HALF_SUN_HEIGHT = 14;
export const FULL_SUN_HEIGHT = HALF_SUN_HEIGHT * 2;

export default function SunShape({ color, scale = 1, full = false }: { color: string; scale?: number; full?: boolean }) {
  const fill = { backgroundColor: color };
  const rays = (
    <>
      <View style={[styles.ray, styles.rayL1, fill]} />
      <View style={[styles.ray, styles.rayL2, fill]} />
      <View style={[styles.ray, styles.rayR2, fill]} />
      <View style={[styles.ray, styles.rayR1, fill]} />
    </>
  );
  return (
    <View style={[styles.row, full && styles.fullRow, scale !== 1 && { transform: [{ scale }] }]}>
      {full ? (
        <>
          <View style={styles.rayRow}>{rays}</View>
          <View style={[styles.rayRow, styles.lowerRays]}>{rays}</View>
        </>
      ) : rays}
      <View style={[styles.sun, full && styles.fullSun, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: 34,
    height: HALF_SUN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fullRow: {
    height: FULL_SUN_HEIGHT,
    justifyContent: 'center',
  },
  rayRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HALF_SUN_HEIGHT,
  },
  lowerRays: {
    top: HALF_SUN_HEIGHT,
    transform: [{ scaleY: -1 }],
  },
  sun: {
    width: 16,
    height: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  fullSun: {
    height: 16,
    borderRadius: 8,
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
