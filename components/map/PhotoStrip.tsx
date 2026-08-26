import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { Image } from 'expo-image';

import ImageViewer from '@/components/ui/ImageViewer';

export interface PhotoStripItem {
  url: string;
}

// 장소 상세의 사진 스트립 — 가로 스와이프로 훑고, 탭하면 사진만 확대한다.
// 리뷰 내용은 아래 리뷰 목록에서 확인하고 사진 감상 화면 위에는 겹치지 않는다.
export default function PhotoStrip({
  items,
  size = 150,
  bleed = 0,
}: {
  items: PhotoStripItem[];
  /** 썸네일 한 변 (목록 카드처럼 좁은 자리에서는 줄여 쓴다) */
  size?: number;
  /** 부모 컨테이너의 가로 패딩만큼 흘려 화면 끝까지 스크롤되게 한다 */
  bleed?: number;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const photoUrls = useMemo(() => items.map((item) => item.url), [items]);

  if (items.length === 0) return null;

  return (
    <>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={bleed > 0 && { marginHorizontal: -bleed }}
        contentContainerStyle={bleed > 0 && { paddingHorizontal: bleed }}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        ItemSeparatorComponent={PhotoSeparator}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityLabel={`장소 사진 ${index + 1} 확대`}
            accessibilityRole="button"
            onPress={() => setViewerIndex(index)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Image
              source={{ uri: item.url }}
              style={[styles.photo, { width: size, height: size }]}
              cachePolicy="memory-disk"
              recyclingKey={item.url}
              transition={100}
            />
          </Pressable>
        )}
      />

      <ImageViewer
        visible={viewerIndex !== null}
        photos={photoUrls}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  photo: {
    borderRadius: 12,
  },
  separator: {
    width: 8,
  },
});

function PhotoSeparator() {
  return <View style={styles.separator} />;
}
