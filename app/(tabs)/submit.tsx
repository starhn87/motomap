import CategoryIcon from '@/components/ui/CategoryIcon';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { CATEGORY_LIST } from '@/constants/categories';
import { submitPlace, checkPlaceDuplicate } from '@/lib/api/places';
import { registerPushToken } from '@/lib/push';
import { toast } from '@/lib/toast';
import { track } from '@/lib/analytics';
import LoginPrompt from '@/components/auth/LoginPrompt';
import SubmitRidingGuide from '@/components/submit/SubmitRidingGuide';
import SubmitFeedback from '@/components/submit/SubmitFeedback';
import SubmitHazard from '@/components/submit/SubmitHazard';
import AddressSearchModal from '@/components/submit/AddressSearchModal';
import type { PlaceCategory } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SubmitType = 'place' | 'riding' | 'hazard' | 'feedback';

function SubmitTypeTab({
  type,
  current,
  onPress,
}: {
  type: SubmitType;
  current: SubmitType;
  onPress: (t: SubmitType) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isActive = current === type;
  const labels: Record<SubmitType, string> = {
    place: '장소',
    riding: '라이딩',
    hazard: '위험',
    feedback: '건의',
  };
  const label = labels[type];

  return (
    <Pressable
      onPress={() => onPress(type)}
      style={[
        styles.tab,
        {
          backgroundColor: isActive ? colors.tint : 'transparent',
          borderColor: isActive ? colors.tint : colors.border,
        },
      ]}>
      <Text
        style={[
          styles.tabLabel,
          { color: isActive ? colors.background : colors.textSecondary },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SubmitPlace() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressDetail, setAddressDetail] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState<{
    provider: 'kakao' | 'coordinate';
    placeId: string;
  } | null>(null);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // 지도의 "일반 장소" 시트에서 넘어온 프리필 (이름·주소·좌표)
  const { prefillName, prefillAddress, prefillLat, prefillLng, prefillProvider, prefillProviderId, prefillSource, prefillTs } =
    useLocalSearchParams<{
      prefillName?: string;
      prefillAddress?: string;
      prefillLat?: string;
      prefillLng?: string;
      prefillProvider?: string;
      prefillProviderId?: string;
      prefillSource?: string;
      prefillTs?: string;
    }>();
  const handledPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prefillName || !prefillTs || handledPrefillRef.current === prefillTs) return;
    handledPrefillRef.current = prefillTs;
    // 탭 화면은 라우팅 뒤에도 마운트 상태가 유지된다. 일반 장소 상세에서 다시
    // 들어오면 이전 제보 폼의 스크롤을 이어받지 않고 처음부터 보여준다.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setName(prefillName);
    if (prefillAddress) setAddress(prefillAddress);
    if (
      (prefillProvider === 'kakao' || prefillProvider === 'coordinate') &&
      prefillProviderId
    ) {
      setSourceIdentity({ provider: prefillProvider, placeId: prefillProviderId });
    } else {
      setSourceIdentity(null);
    }
    if (prefillLat && prefillLng) {
      const latitude = Number(prefillLat);
      const longitude = Number(prefillLng);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= 32 &&
        latitude <= 39 &&
        longitude >= 124 &&
        longitude <= 132
      ) {
        setCoords({ latitude, longitude });
      }
    }
  }, [prefillName, prefillAddress, prefillLat, prefillLng, prefillProvider, prefillProviderId, prefillTs]);

  const submitScale = useSharedValue(1);
  const submitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: submitScale.value }],
  }));

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!name.trim()) {
      toast.info('장소명을 입력해주세요.');
      return;
    }
    if (!category) {
      toast.info('카테고리를 선택해주세요.');
      return;
    }
    if (!address.trim() || !coords) {
      toast.info('주소를 검색해서 선택해주세요.');
      return;
    }

    setSubmitting(true);
    submitScale.value = withSpring(0.95);

    try {
      // 같은 주소의 기존 장소/제보가 있으면 중복 제출을 막는다
      const dup = await checkPlaceDuplicate(address.trim());
      if (dup) {
        toast.info(
          dup === 'approved' ? '이미 등록된 장소예요.' : '이미 제보된 장소예요.',
          dup === 'approved'
            ? '모토맵 지도에서 확인할 수 있어요.'
            : '검토 중이니 조금만 기다려주세요.'
        );
        return;
      }

      await submitPlace({
        name: name.trim(),
        description: description.trim(),
        category,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: [address.trim(), addressDetail.trim()].filter(Boolean).join(' '),
        sourceProvider: sourceIdentity?.provider,
        sourcePlaceId: sourceIdentity?.placeId,
      });

      track.placeSubmitted({
        category,
        source:
          prefillSource === 'arrival' ||
          prefillSource === 'temp_place' ||
          prefillSource === 'search_empty'
            ? prefillSource
            : 'tab',
      });

      // 권한 요청(모달)이 완료 토스트·폼 리셋을 가리면 "제보가 안 됐다"고 오해해
      // 중복 제보하게 되므로, 권한 흐름을 먼저 끝낸 뒤 완료 처리를 한다.
      // (registerPushToken 은 내부에서 실패를 삼키므로 await 가 안전)
      await registerPushToken(true);

      toast.success('제보가 접수되었습니다.', '승인되면 알림으로 알려드릴게요.');

      setName('');
      setDescription('');
      setCategory(null);
      setAddress('');
      setCoords(null);
      setAddressDetail('');
      setSourceIdentity(null);
    } catch (error: any) {
      toast.error('제보에 실패했습니다.', error.message);
    } finally {
      setSubmitting(false);
      submitScale.value = withSpring(1);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.surface,
      color: colors.text,
      borderColor: colors.border,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Text style={[styles.sectionTitle, { color: colors.text }]}>카테고리 *</Text>
        <View style={styles.categories}>
          {CATEGORY_LIST.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => setCategory(cat.key)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat.key ? cat.color : colors.surfaceMuted,
                  borderColor: category === cat.key ? cat.color : colors.border,
                },
              ]}>
              <CategoryIcon category={cat.key} size={15} color={category === cat.key ? colors.background : cat.color} />
              <Text style={[styles.categoryLabel, { color: category === cat.key ? colors.background : colors.text }]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>장소 검색 *</Text>
        <Pressable onPress={() => setAddressModalVisible(true)} style={inputStyle}>
          <Text style={{ color: address ? colors.text : colors.textSecondary, fontSize: 15 }}>
            {address || '탭해서 상호·주소 검색'}
          </Text>
        </Pressable>
        {address ? (
          <TextInput
            style={[inputStyle, { marginTop: 8 }]}
            placeholder="상세 주소 (동·호수·층 등, 선택)"
            placeholderTextColor={colors.textSecondary}
            value={addressDetail}
            onChangeText={setAddressDetail}
          />
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>장소명 *</Text>
        <TextInput style={inputStyle} placeholder="장소를 검색하면 자동 입력됩니다" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>설명</Text>
        <TextInput style={[...inputStyle, styles.multiline]} placeholder="이 장소에 대해 알려주세요" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

        <AnimatedPressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[
            styles.submitButton,
            submitStyle,
            { backgroundColor: colors.tint, opacity: submitting ? 0.6 : 1 },
          ]}>
          <Text style={[styles.submitText, { color: colors.background }]}>{submitting ? '제보 중...' : '장소 제보하기'}</Text>
        </AnimatedPressable>
      </ScrollView>
      <AddressSearchModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        onSelect={(r) => {
          setAddress(r.roadAddress || r.address);
          setCoords({ latitude: r.latitude, longitude: r.longitude });
          setSourceIdentity(
            r.providerId ? { provider: 'kakao', placeId: r.providerId } : null,
          );
          // 장소명은 검색 결과가 정한다(다시 선택하면 갱신). 카카오에 없는
          // 장소(뷰포인트 등)를 위해 필드 자체는 수정 가능하게 둔다.
          if (r.placeName) setName(r.placeName);
        }}
      />
    </KeyboardAvoidingView>
  );
}

export default function SubmitScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const [submitType, setSubmitType] = useState<SubmitType>('place');
  const { submitType: requestedType, submitTs } = useLocalSearchParams<{
    submitType?: string;
    submitTs?: string;
  }>();

  // 다른 화면의 CTA에서 제보 탭을 열 때, 이전에 보던 위험·건의 탭이 남지 않게 한다.
  // 같은 장소 CTA를 다시 눌러도 timestamp가 바뀌므로 매번 장소 탭으로 돌아온다.
  useEffect(() => {
    if (
      requestedType === 'place' ||
      requestedType === 'riding' ||
      requestedType === 'hazard' ||
      requestedType === 'feedback'
    ) {
      setSubmitType(requestedType);
    } else if (requestedType === 'course') {
      // 이전 OTA에서 만든 제보 CTA도 새 라이딩 제안 폼으로 이어준다.
      setSubmitType('riding');
    }
  }, [requestedType, submitTs]);

  if (!user) {
    return <LoginPrompt message="제보하려면 로그인이 필요합니다." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabRow}>
        <SubmitTypeTab type="place" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="riding" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="hazard" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="feedback" current={submitType} onPress={setSubmitType} />
      </View>

      {submitType === 'place' && <SubmitPlace />}
      {submitType === 'riding' && <SubmitRidingGuide />}
      {submitType === 'hazard' && <SubmitHazard />}
      {submitType === 'feedback' && <SubmitFeedback />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabLabel: { fontSize: 14, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryIcon: { fontSize: 14, marginRight: 4 },
  categoryLabel: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 14, fontWeight: '500' },
  submitButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitText: { fontSize: 16, fontWeight: '700' },
});
