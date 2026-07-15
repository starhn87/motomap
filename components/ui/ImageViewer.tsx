import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  photos: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  /** 현재 사진 하단에 띄울 부가 정보 (예: 해당 사진이 달린 리뷰) */
  renderFooter?: (index: number) => React.ReactNode;
}

// 전체화면 이미지 뷰어 — 좌우 스와이프로 넘기고, 이미지 탭 또는 ✕ 로 닫는다.
// RN Modal 은 네이티브 루트에 뜨므로 바텀시트 안에서 열어도 항상 최상위에 표시된다.
export default function ImageViewer({
  photos,
  initialIndex = 0,
  visible,
  onClose,
  renderFooter,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(item, i) => `${item}-${i}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <Pressable style={{ width, height }} onPress={onClose}>
              <Image
                source={{ uri: item }}
                style={{ width, height }}
                contentFit="contain"
                transition={150}
              />
            </Pressable>
          )}
        />

        {photos.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 14 }]} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1} / {photos.length}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + 8 }]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {renderFooter && (
          <View
            style={[styles.footerWrap, { paddingBottom: insets.bottom + 16 }]}
            pointerEvents="box-none">
            {renderFooter(index)}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
});
