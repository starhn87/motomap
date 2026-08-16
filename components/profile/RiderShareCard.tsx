import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import CategoryIcon from '@/components/ui/CategoryIcon';
import { APP_STORE_URL } from '@/constants/app';
import { CATEGORIES } from '@/constants/categories';
import { haptics } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import type { PlaceCategory } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  nickname: string;
  bike: string | null;
  places: number;
  rides: number;
  milestones: { category: PlaceCategory; places: number }[];
}

export default function RiderShareCard({
  visible,
  onClose,
  nickname,
  bike,
  places,
  rides,
  milestones,
}: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    let uri: string | null = null;
    try {
      if (await Sharing.isAvailableAsync()) {
        uri = await captureRef(cardRef, {
          format: 'png',
          result: 'tmpfile',
          width: 1080,
          height: 1350,
        });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: '나의 주행 기록 공유',
        });
      } else {
        await Share.share({
          title: bike ? `${bike} 주행 기록` : '나의 주행 기록',
          message: `모토맵에서 ${places}곳을 ${rides}번 달렸어요 🏍️\n${APP_STORE_URL}`,
        });
      }
      haptics.success();
      track.bikePassportShared({ scope: bike ? 'bike' : 'all', places, rides });
    } catch (error) {
      toast.error('공유 카드를 만들지 못했습니다.', (error as Error).message);
    } finally {
      if (uri) releaseCapture(uri);
      setSharing(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <Text style={styles.previewTitle}>공유 카드 미리보기</Text>
          <Pressable accessibilityLabel="닫기" hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        <View ref={cardRef} collapsable={false} style={styles.card}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="navigate" size={17} color="#07140E" />
            </View>
            <Text style={styles.brand}>모토맵</Text>
            <Text style={styles.cardType}>라이더 기록</Text>
          </View>

          <View style={styles.identity}>
            <Text style={styles.nickname} numberOfLines={1}>{nickname}</Text>
            <Text style={styles.bike} numberOfLines={2}>{bike ?? '모든 바이크'}</Text>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{places}</Text>
              <Text style={styles.statLabel}>다녀온 곳</Text>
            </View>
            <View style={styles.statLine} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{rides}</Text>
              <Text style={styles.statLabel}>주행</Text>
            </View>
          </View>

          <View style={styles.milestones}>
            {milestones.length > 0 ? milestones.map(({ category, places: count }) => (
              <View key={category} style={styles.milestone}>
                <CategoryIcon category={category} size={15} color="#BAF7D0" />
                <Text style={styles.milestoneText}>
                  {CATEGORIES[category].label} {count}곳
                </Text>
              </View>
            )) : (
              <Text style={styles.firstRide}>새로운 라이딩 기록을 쌓는 중</Text>
            )}
          </View>

          <Text style={styles.footer}>달리고 · 발견하고 · 기록하다</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={sharing}
          onPress={() => void share()}
          style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.82 : 1 }]}>
          {sharing ? (
            <ActivityIndicator size="small" color="#07140E" />
          ) : (
            <>
              <Ionicons name="share-outline" size={19} color="#07140E" />
              <Text style={styles.shareText}>이미지로 공유</Text>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#07140E',
    borderWidth: 1,
    borderColor: '#1C5B37',
    padding: 26,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: '#BAF7D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  cardType: {
    marginLeft: 'auto',
    color: '#83CDA0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  identity: {
    marginTop: 36,
  },
  nickname: {
    color: '#83CDA0',
    fontSize: 13,
    fontWeight: '700',
  },
  bike: {
    marginTop: 7,
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: '#0E281A',
  },
  stat: {
    flex: 1,
  },
  statValue: {
    color: '#BAF7D0',
    fontSize: 30,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    marginTop: 2,
    color: '#83CDA0',
    fontSize: 11,
    fontWeight: '600',
  },
  statLine: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    marginHorizontal: 20,
    backgroundColor: '#2A6542',
  },
  milestones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 18,
  },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#275E3D',
  },
  milestoneText: {
    color: '#D9FBE4',
    fontSize: 11,
    fontWeight: '600',
  },
  firstRide: {
    color: '#83CDA0',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    left: 26,
    bottom: 24,
    color: '#5A9D72',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  shareButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#BAF7D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  shareText: {
    color: '#07140E',
    fontSize: 15,
    fontWeight: '800',
  },
});
