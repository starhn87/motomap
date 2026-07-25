import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NaverMapView } from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
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

// 지도를 움직여 화면 중앙 십자에 위치를 맞추는 선택기. 중심을 마커로 그리지 않고
// 고정 오버레이로 두는 게 표준 — 지도만 움직이면 되니 손이 가려지지 않는다.
export default function MapPickerModal({ visible, initial, onClose, onPick }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const mapRef = useRef<NaverMapViewRef>(null);
  const centerRef = useRef({
    latitude: initial?.latitude ?? DEFAULT_CENTER[1],
    longitude: initial?.longitude ?? DEFAULT_CENTER[0],
  });
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const addressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 카메라가 멈춘 뒤에만 역지오코딩한다 (이동 중 매 프레임 호출 방지)
  const scheduleAddress = () => {
    if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    setResolving(true);
    addressTimerRef.current = setTimeout(async () => {
      const { latitude, longitude } = centerRef.current;
      const value = await coordToAddress(latitude, longitude);
      setAddress(value);
      setResolving(false);
    }, 400);
  };

  useEffect(() => {
    if (visible) scheduleAddress();
    return () => {
      if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <NaverMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType="Basic"
          isNightModeEnabled={colorScheme === 'dark'}
          isShowLocationButton={false}
          isShowCompass={false}
          isShowScaleBar={false}
          isShowZoomControls={false}
          locale="ko"
          initialCamera={{
            latitude: centerRef.current.latitude,
            longitude: centerRef.current.longitude,
            zoom: initial ? 16 : DEFAULT_ZOOM,
          }}
          onCameraChanged={(e) => {
            centerRef.current = { latitude: e.latitude, longitude: e.longitude };
            scheduleAddress();
          }}
        />

        {/* 화면 중앙 고정 핀 — 지도가 움직이고 핀은 제자리 */}
        <View style={styles.pinWrap} pointerEvents="none">
          {/* 핀 끝이 화면 정중앙을 찍도록 아이콘 높이의 절반만큼 올린다 */}
          <View style={styles.pinLift}>
            <Ionicons name="location" size={38} color={colors.tint} />
          </View>
        </View>

        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={[
            styles.close,
            { top: insets.top + 12, backgroundColor: colors.surfaceElevated, borderColor: colors.border },
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
              {resolving ? '위치 확인 중…' : (address ?? '주소를 찾을 수 없는 위치')}
            </Text>
          </View>
          <Pressable
            onPress={() => onPick({ ...centerRef.current, address })}
            disabled={resolving}
            style={({ pressed }) => [
              styles.confirm,
              { backgroundColor: colors.tint, opacity: pressed || resolving ? 0.8 : 1 },
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
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLift: { transform: [{ translateY: -19 }] },
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
