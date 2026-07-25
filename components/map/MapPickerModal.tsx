import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NaverMapView, NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';

interface Props {
  visible: boolean;
  initial?: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onPick: (coord: { latitude: number; longitude: number; address: string | null }) => void;
}

// 지도를 탭해 지점을 찍는 선택기. 중앙 고정 핀 방식은 지도를 움직일 때마다
// 역지오코딩을 부르는데, 지도는 훑어보려고 움직이는 경우가 대부분이라 헛호출이 많다.
// 탭한 순간에만 핀을 옮기고 그때 한 번 주소를 조회한다.
export default function MapPickerModal({ visible, initial, onClose, onPick }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // 열 때마다 초기 위치(현재 위치 등)에 핀을 놓고 시작한다
  useEffect(() => {
    if (!visible) return;
    setMarker(initial ?? null);
    setAddress(null);
    if (initial) void resolveAddress(initial.latitude, initial.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolveAddress = async (latitude: number, longitude: number) => {
    setResolving(true);
    try {
      setAddress(await coordToAddress(latitude, longitude));
    } finally {
      setResolving(false);
    }
  };

  const handleTap = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setMarker({ latitude, longitude });
    setAddress(null);
    void resolveAddress(latitude, longitude);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <NaverMapView
          style={StyleSheet.absoluteFill}
          mapType="Basic"
          isNightModeEnabled={colorScheme === 'dark'}
          isShowLocationButton={false}
          isShowCompass={false}
          isShowScaleBar={false}
          isShowZoomControls={false}
          locale="ko"
          initialCamera={{
            latitude: initial?.latitude ?? DEFAULT_CENTER[1],
            longitude: initial?.longitude ?? DEFAULT_CENTER[0],
            zoom: initial ? 16 : DEFAULT_ZOOM,
          }}
          onTapMap={handleTap}>
          {marker && (
            <NaverMapMarkerOverlay
              latitude={marker.latitude}
              longitude={marker.longitude}
              image={require('@/assets/images/markers/general.png')}
              width={36}
              height={50}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
        </NaverMapView>

        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={[
            styles.close,
            {
              top: insets.top + 12,
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 16,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.address, { color: colors.text }]} numberOfLines={2}>
              {!marker
                ? '지도를 눌러 위치를 찍어주세요.'
                : resolving
                  ? '위치 확인 중…'
                  : (address ?? '주소를 찾을 수 없는 지점')}
            </Text>
          </View>
          <Pressable
            onPress={() => marker && onPick({ ...marker, address })}
            disabled={!marker || resolving}
            style={({ pressed }) => [
              styles.confirm,
              {
                backgroundColor: colors.tint,
                opacity: !marker || resolving ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}>
            {resolving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.confirmText, { color: colors.background }]}>이 위치로 선택</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 14,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, fontSize: 15, fontWeight: '600' },
  confirm: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700' },
});
