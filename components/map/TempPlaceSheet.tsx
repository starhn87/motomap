import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { openNavigation } from '@/lib/navigation';
import { useMyPlacesStore, type MyPlaceSlot } from '@/stores/useMyPlacesStore';
import { toast } from '@/lib/toast';

export interface TempPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  place: TempPlace;
  onClose: () => void;
}

// 검색의 "일반 장소"(카카오 로컬 결과)를 골랐을 때 뜨는 경량 카드 — DB 장소가
// 아니므로 리뷰·즐겨찾기 없이 길안내와 제보 진입만 제공한다.
export default function TempPlaceSheet({ place, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const myPlaces = useMyPlacesStore((s) => s.places);
  const loadMyPlaces = useMyPlacesStore((s) => s.load);
  const saveMyPlace = useMyPlacesStore((s) => s.save);
  const removeMyPlace = useMyPlacesStore((s) => s.remove);

  useEffect(() => {
    void loadMyPlaces();
  }, [loadMyPlaces]);

  // 이 장소가 이미 집/회사로 저장돼 있는지 (좌표 근사 일치)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  const savedSlot: MyPlaceSlot | null =
    myPlaces.home && near(myPlaces.home.latitude, place.latitude) && near(myPlaces.home.longitude, place.longitude)
      ? 'home'
      : myPlaces.work && near(myPlaces.work.latitude, place.latitude) && near(myPlaces.work.longitude, place.longitude)
        ? 'work'
        : null;

  const handleSaveMyPlace = () => {
    if (savedSlot) {
      const isHome = savedSlot === 'home';
      Alert.alert(isHome ? '집으로 저장된 장소' : '회사로 저장된 장소', place.name, [
        { text: '취소', style: 'cancel' },
        {
          text: isHome ? '회사로 변경' : '집으로 변경',
          onPress: async () => {
            await removeMyPlace(savedSlot);
            await saveMyPlace(isHome ? 'work' : 'home', place);
            toast.success(isHome ? '회사로 변경했어요.' : '집으로 변경했어요.');
          },
        },
        {
          text: '저장 해제',
          style: 'destructive',
          onPress: async () => {
            await removeMyPlace(savedSlot);
            toast.info('내 장소에서 해제했어요.');
          },
        },
      ]);
      return;
    }
    Alert.alert('내 장소로 저장', `${place.name}\n검색 화면에서 바로 길안내할 수 있어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '집으로',
        onPress: async () => {
          await saveMyPlace('home', place);
          toast.success('집으로 저장했어요.');
        },
      },
      {
        text: '회사로',
        onPress: async () => {
          await saveMyPlace('work', place);
          toast.success('회사로 저장했어요.');
        },
      },
    ]);
  };

  const handleNavigate = () => {
    void openNavigation({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    });
  };

  const handleSubmit = () => {
    onClose();
    router.navigate({
      pathname: '/submit',
      params: {
        prefillName: place.name,
        prefillAddress: place.address,
        prefillLat: String(place.latitude),
        prefillLng: String(place.longitude),
        prefillTs: String(Date.now()),
      },
    });
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>
            {place.address}
          </Text>
        </View>
        <Pressable onPress={handleSaveMyPlace} hitSlop={8} style={styles.saveButton}>
          <Ionicons
            name={savedSlot === 'home' ? 'home' : savedSlot === 'work' ? 'business' : 'star-outline'}
            size={20}
            color={savedSlot ? colors.tint : colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleNavigate}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[styles.actionText, { color: colors.background }]}>길안내 시작</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.actionText, { color: colors.text }]}>이곳 제보하기</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  address: {
    fontSize: 13,
  },
  saveButton: {
    padding: 2,
    marginRight: 10,
  },
  closeButton: {
    padding: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
