import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { HAZARD_LIST } from '@/constants/hazards';
import { useSubmitHazard } from '@/hooks/useHazards';
import { useMapStore } from '@/stores/useMapStore';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import AddressSearchModal from '@/components/submit/AddressSearchModal';
import MapPickerModal from '@/components/map/MapPickerModal';
import { pickImage, uploadImage } from '@/lib/uploadImage';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from '@/lib/toast';
import type { HazardType } from '@/types';

// 노면 위험 제보 — 지금 서 있는 자리를 찍는 게 기본 시나리오라 현재 위치를 쓴다.
export default function SubmitHazard() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const userLocation = useMapStore((s) => s.userLocation);
  const { mutateAsync: submit, isPending } = useSubmitHazard();

  const [type, setType] = useState<HazardType | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  // 직접 고른 위치. null 이면 현재 위치를 쓴다.
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const coord = picked ?? userLocation ?? null;

  // 현재 위치를 쓰는 동안에만 주소를 따라 갱신한다 (직접 고른 위치는 그때 주소가 정해짐)
  useEffect(() => {
    if (picked || !userLocation) return;
    let cancelled = false;
    void coordToAddress(userLocation.latitude, userLocation.longitude).then((value) => {
      if (!cancelled) setAddress(value);
    });
    return () => {
      cancelled = true;
    };
  }, [picked, userLocation?.latitude, userLocation?.longitude]);

  const handlePickPhoto = async () => {
    const uri = await pickImage();
    if (!uri || !user) return;
    setUploading(true);
    try {
      setPhoto(await uploadImage(uri, `hazards/${user.id}`));
    } catch (error: any) {
      toast.error('사진 업로드에 실패했습니다.', error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!type) {
      toast.info('위험 유형을 선택해주세요.');
      return;
    }
    if (!coord) {
      toast.info('위치를 선택해주세요.');
      return;
    }
    if (type === 'etc' && !note.trim()) {
      toast.info('어떤 위험인지 적어주세요.');
      return;
    }
    try {
      await submit({
        type,
        latitude: coord.latitude,
        longitude: coord.longitude,
        address: address ?? undefined,
        note,
        photo: photo ?? undefined,
      });
      setType(null);
      setNote('');
      setPhoto(null);
      setPicked(null);
      toast.success('제보 감사합니다. 다른 라이더에게 바로 표시돼요.');
    } catch (error: any) {
      toast.error('제보에 실패했습니다.', error.message);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: colors.text }]}>위험 유형 *</Text>
        <View style={styles.typeGrid}>
          {HAZARD_LIST.map((h) => {
            const active = type === h.key;
            return (
              <Pressable
                key={h.key}
                onPress={() => setType(h.key)}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: active ? `${h.color}1A` : colors.surface,
                    borderColor: active ? h.color : colors.border,
                  },
                ]}>
                <MaterialCommunityIcons
                  name={h.icon as any}
                  size={16}
                  color={active ? h.color : colors.textSecondary}
                />
                <Text
                  style={[styles.typeLabel, { color: active ? h.color : colors.textSecondary }]}>
                  {h.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>위치 *</Text>
        <View style={[styles.locationBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={2}>
            {coord
              ? (address ?? (picked ? '선택한 위치' : '현재 위치'))
              : '위치를 선택해주세요.'}
          </Text>
        </View>
        <View style={styles.locationActions}>
          <Pressable
            onPress={() => {
              setPicked(null);
              setAddress(null);
            }}
            disabled={!userLocation}
            style={[
              styles.locationAction,
              {
                backgroundColor: !picked ? `${colors.tint}14` : colors.surface,
                borderColor: !picked ? colors.tint : colors.border,
                opacity: userLocation ? 1 : 0.5,
              },
            ]}>
            <Ionicons
              name="navigate-outline"
              size={15}
              color={!picked ? colors.tint : colors.textSecondary}
            />
            <Text
              style={[
                styles.locationActionText,
                { color: !picked ? colors.tint : colors.textSecondary },
              ]}>
              현재 위치
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSearchOpen(true)}
            style={[styles.locationAction, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={15} color={colors.textSecondary} />
            <Text style={[styles.locationActionText, { color: colors.textSecondary }]}>검색</Text>
          </Pressable>
          <Pressable
            onPress={() => setMapOpen(true)}
            style={[styles.locationAction, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="map-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.locationActionText, { color: colors.textSecondary }]}>지도에서</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {picked
            ? '지도에서 고른 위치로 등록됩니다.'
            : '지금 서 있는 위치로 등록됩니다. 나중에 제보할 땐 검색이나 지도를 쓰세요.'}
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {type === 'etc' ? '어떤 위험인가요 *' : '메모'}
        </Text>
        <TextInput
          style={[...inputStyle, styles.multiline]}
          placeholder={
            type === 'etc'
              ? '예) 도로 함몰, 가드레일 파손'
              : '어떤 상황인지 알려주세요 (선택)'
          }
          placeholderTextColor={colors.textSecondary}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>사진</Text>
        {photo ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
            <Pressable onPress={() => setPhoto(null)} hitSlop={8} style={styles.photoRemove}>
              <Ionicons name="close" size={13} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => void handlePickPhoto()}
            disabled={uploading}
            style={[styles.photoAdd, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.photoAddText, { color: colors.textSecondary }]}>
                  사진 추가 (선택, 1장)
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={isPending}
          style={({ pressed }) => [
            styles.submit,
            { backgroundColor: colors.tint, opacity: pressed || isPending ? 0.8 : 1 },
          ]}>
          {isPending ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[styles.submitText, { color: colors.background }]}>위험 제보하기</Text>
          )}
        </Pressable>
      </ScrollView>

      <AddressSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(result) => {
          setPicked({ latitude: result.latitude, longitude: result.longitude });
          setAddress(result.roadAddress || result.address);
          setSearchOpen(false);
        }}
      />

      <MapPickerModal
        visible={mapOpen}
        initial={coord}
        onClose={() => setMapOpen(false)}
        onPick={({ latitude, longitude, address: pickedAddress }) => {
          setPicked({ latitude, longitude });
          setAddress(pickedAddress);
          setMapOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeLabel: { fontSize: 13, fontWeight: '600' },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationText: { flex: 1, fontSize: 14 },
  locationActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  locationAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  locationActionText: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  // 삭제는 사진 우상단에 겹쳐 둔다 (리뷰 사진 목록과 같은 자리)
  photoWrap: { alignSelf: 'flex-start' },
  photo: { width: 88, height: 88, borderRadius: 12 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
  },
  photoAddText: { fontSize: 14, fontWeight: '600' },
  submit: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '700' },
});
