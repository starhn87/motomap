import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { appAlert } from '@/lib/dialog';
import { toast } from '@/lib/toast';

// 집·회사는 로그인과 무관한 기기 로컬 설정이다.
export default function MyPlacesSettings() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const myPlaces = useMyPlacesStore(s => s.places);
  const loadMyPlaces = useMyPlacesStore(s => s.load);
  const saveMyPlace = useMyPlacesStore(s => s.save);
  const removeMyPlace = useMyPlacesStore(s => s.remove);
  useEffect(() => { void loadMyPlaces(); }, [loadMyPlaces]);
  const [editingSlot, setEditingSlot] = useState<MyPlaceSlot | null>(null);

  const handleMyPlace = (slot: MyPlaceSlot) => {
    const label = slot === 'home' ? '집' : '회사';
    const saved = myPlaces[slot];
    if (!saved) {
      setEditingSlot(slot);
      return;
    }
    // 집·회사 이름은 민감 정보 — 앱 다이얼로그라 리플레이 마스킹이 닿는다
    appAlert(label, saved.name, [
      { text: '변경', onPress: () => setEditingSlot(slot) },
      { text: '삭제', style: 'destructive', onPress: () => void removeMyPlace(slot) },
      { text: '취소', style: 'cancel' },
    ], { maskMessage: true });
  };

  const handleSlotSelect = (point: Point, address?: string) => {
    const slot = editingSlot;
    setEditingSlot(null);
    if (!slot || point === 'current') return;
    void saveMyPlace(slot, {
      name: point.name,
      address: address ?? '',
      latitude: point.latitude,
      longitude: point.longitude,
    });
    toast.success(slot === 'home' ? '집을 저장했어요.' : '회사를 저장했어요.');
  };

  return (
    <>
      {(['home', 'work'] as const).map(slot => (
        <Pressable key={slot} accessibilityRole="button" onPress={() => handleMyPlace(slot)}
          style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name={slot === 'home' ? 'home-outline' : 'business-outline'} size={20} color={colors.tint} />
          <Text style={[styles.label, { color: colors.text }]}>{slot === 'home' ? '집' : '회사'}</Text>
          <Text style={{ color: colors.textSecondary }}>{myPlaces[slot] ? '설정됨' : '설정 안 됨'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </Pressable>
      ))}
      <PointSearchModal visible={editingSlot !== null} confirmSlot={editingSlot} allowCurrent={false}
        title={editingSlot === 'home' ? '집 설정' : '회사 설정'}
        onClose={() => setEditingSlot(null)} onSelect={handleSlotSelect} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, padding: 16, borderRadius: 12, borderWidth: 1, marginTop: 0 },
  label: { flex: 1, fontSize: 14, fontWeight: '500' },
});
