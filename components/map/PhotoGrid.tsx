import { View, StyleSheet, Dimensions, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Props {
  photos: string[];
  maxShow?: number;
}

export default function PhotoGrid({ photos, maxShow = 4 }: Props) {
  if (photos.length === 0) return null;

  const shown = photos.slice(0, maxShow);
  const remaining = photos.length - maxShow;

  if (shown.length === 1) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: shown[0] }} style={styles.single} />
      </View>
    );
  }

  if (shown.length === 2) {
    return (
      <View style={[styles.container, styles.row]}>
        <Image source={{ uri: shown[0] }} style={styles.half} />
        <Image source={{ uri: shown[1] }} style={styles.half} />
      </View>
    );
  }

  if (shown.length === 3) {
    return (
      <View style={[styles.container, styles.row]}>
        <Image source={{ uri: shown[0] }} style={styles.twoThirds} />
        <View style={styles.column}>
          <Image source={{ uri: shown[1] }} style={styles.quarterHeight} />
          <Image source={{ uri: shown[2] }} style={styles.quarterHeight} />
        </View>
      </View>
    );
  }

  // 4+
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Image source={{ uri: shown[0] }} style={styles.half} />
        <Image source={{ uri: shown[1] }} style={styles.half} />
      </View>
      <View style={styles.row}>
        <Image source={{ uri: shown[2] }} style={styles.half} />
        <View style={styles.half}>
          <Image source={{ uri: shown[3] }} style={StyleSheet.absoluteFill} />
          {remaining > 0 && (
            <View style={styles.overlay}>
              <Text style={styles.overlayText}>+{remaining}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const GRID_HEIGHT = 200;
const GAP = 2;

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  single: {
    width: '100%',
    height: GRID_HEIGHT,
  },
  half: {
    flex: 1,
    height: GRID_HEIGHT / 2,
  },
  twoThirds: {
    flex: 2,
    height: GRID_HEIGHT,
  },
  quarterHeight: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
});
