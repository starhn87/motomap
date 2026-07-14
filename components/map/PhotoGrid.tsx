import { useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';

import ImageViewer from '@/components/ui/ImageViewer';

interface Props {
  photos: string[];
  maxShow?: number;
}

export default function PhotoGrid({ photos, maxShow = 4 }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const shown = photos.slice(0, maxShow);
  const remaining = photos.length - maxShow;

  // 셀 하나 — 탭하면 해당 사진부터 전체 photos 를 스와이프로 볼 수 있다
  const cell = (index: number, style: object, children?: React.ReactNode) => (
    <Pressable style={style} onPress={() => setViewerIndex(index)}>
      <Image source={{ uri: shown[index] }} style={StyleSheet.absoluteFill} />
      {children}
    </Pressable>
  );

  const viewer = (
    <ImageViewer
      visible={viewerIndex !== null}
      photos={photos}
      initialIndex={viewerIndex ?? 0}
      onClose={() => setViewerIndex(null)}
    />
  );

  if (shown.length === 1) {
    return (
      <>
        <View style={styles.container}>{cell(0, styles.single)}</View>
        {viewer}
      </>
    );
  }

  if (shown.length === 2) {
    return (
      <>
        <View style={[styles.container, styles.row]}>
          {cell(0, styles.half)}
          {cell(1, styles.half)}
        </View>
        {viewer}
      </>
    );
  }

  if (shown.length === 3) {
    return (
      <>
        <View style={[styles.container, styles.row]}>
          {cell(0, styles.twoThirds)}
          <View style={styles.column}>
            {cell(1, styles.quarterHeight)}
            {cell(2, styles.quarterHeight)}
          </View>
        </View>
        {viewer}
      </>
    );
  }

  // 4+
  return (
    <>
      <View style={styles.container}>
        <View style={styles.row}>
          {cell(0, styles.half)}
          {cell(1, styles.half)}
        </View>
        <View style={styles.row}>
          {cell(2, styles.half)}
          {cell(
            3,
            styles.half,
            remaining > 0 ? (
              <View style={styles.overlay} pointerEvents="none">
                <Text style={styles.overlayText}>+{remaining}</Text>
              </View>
            ) : undefined,
          )}
        </View>
      </View>
      {viewer}
    </>
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
