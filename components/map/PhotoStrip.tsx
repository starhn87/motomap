import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';

import ImageViewer from '@/components/ui/ImageViewer';
import type { Review } from '@/types';

export interface PhotoStripItem {
  url: string;
  /** 이 사진이 달린 리뷰 (장소 자체 사진이면 null) */
  review: Review | null;
}

// 확대 모달 하단에 겹쳐 보여줄 리뷰 요약 카드
function ReviewOverlay({ review }: { review: Review }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayName} numberOfLines={1}>
          {review.userName}
          {review.bikeModel ? `  🏍 ${review.bikeModel}` : ''}
        </Text>
        <Text style={styles.overlayStars}>
          {'★'.repeat(review.rating)}
          {'☆'.repeat(Math.max(0, 5 - review.rating))}
        </Text>
      </View>
      {review.content ? (
        <Text style={styles.overlayContent} numberOfLines={3}>
          {review.content}
        </Text>
      ) : null}
    </View>
  );
}

// 장소 상세의 사진 스트립 — 가로 스와이프로 훑고, 탭하면 확대 모달에서
// 해당 사진이 달린 리뷰를 하단에 함께 보여준다.
// onTouchActive: 스트립을 만지는 동안 바텀시트의 세로 팬을 끄기 위한 신호 —
// 가로 스와이프 중 시트 높이가 흔들리는 제스처 간섭을 막는다.
export default function PhotoStrip({
  items,
  onTouchActive,
}: {
  items: PhotoStripItem[];
  onTouchActive?: (active: boolean) => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => onTouchActive?.(true)}
        onTouchEnd={() => onTouchActive?.(false)}
        onTouchCancel={() => onTouchActive?.(false)}
        onScrollEndDrag={() => onTouchActive?.(false)}>
        <View style={styles.row}>
          {items.map((item, i) => (
            <Pressable key={`${item.url}-${i}`} onPress={() => setViewerIndex(i)}>
              <Image source={{ uri: item.url }} style={styles.photo} transition={100} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ImageViewer
        visible={viewerIndex !== null}
        photos={items.map((item) => item.url)}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        renderFooter={(i) =>
          items[i]?.review ? <ReviewOverlay review={items[i].review!} /> : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  photo: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overlayName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlayStars: {
    color: '#FACC15',
    fontSize: 13,
  },
  overlayContent: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 19,
  },
});
