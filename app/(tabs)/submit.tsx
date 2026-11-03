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
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { CATEGORY_LIST } from '@/constants/categories';
import { submitPlace, checkPlaceDuplicate } from '@/lib/api/places';
import { generalPlaceIdentity } from '@/lib/api/generalPlaces';
import { registerPushToken } from '@/lib/push';
import { toast } from '@/lib/toast';
import { track } from '@/lib/analytics';
import LoginPrompt from '@/components/auth/LoginPrompt';
import SubmitFeedback from '@/components/submit/SubmitFeedback';
import SubmitHazard from '@/components/submit/SubmitHazard';
import AddressSearchModal from '@/components/submit/AddressSearchModal';
import { withNativeTabScreen } from '@/components/navigation/NativeTabScreen';
import { TabScrollSpacer } from '@/components/navigation/tabOcclusion';
import { HeaderInsetContext, useContentHeaderInset } from '@/components/navigation/headerInset';
import HeaderBackdrop from '@/components/ui/HeaderBackdrop';
import type { PlaceCategory } from '@/types';

type SubmitType = 'place' | 'hazard' | 'feedback';
type PlaceSubmissionSource = 'tab' | 'arrival' | 'temp_place' | 'search_empty';

function placeSubmissionSource(source: string | undefined): PlaceSubmissionSource {
  return source === 'arrival' || source === 'temp_place' || source === 'search_empty' ? source : 'tab';
}

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
    hazard: '위험',
    feedback: '건의',
  };
  const label = labels[type];

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={() => onPress(type)}
      style={({ pressed }) => [
        styles.tab,
        {
          backgroundColor: isActive ? colors.tint : 'transparent',
          borderColor: isActive ? colors.tint : colors.border,
          opacity: pressed ? 0.7 : 1,
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
  const headerInset = useContentHeaderInset();
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

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const source = placeSubmissionSource(prefillSource);
    if (!name.trim()) {
      track.placeSubmissionAttempted({ source, result: 'missing_name' });
      toast.info('장소명을 입력해주세요.');
      return;
    }
    if (!category) {
      track.placeSubmissionAttempted({ source, result: 'missing_category' });
      toast.info('카테고리를 선택해주세요.');
      return;
    }
    if (!address.trim() || !coords) {
      track.placeSubmissionAttempted({ source, result: 'missing_address' });
      toast.info('주소를 검색해서 선택해주세요.');
      return;
    }

    setSubmitting(true);
    let accepted = false;

    try {
      // 같은 주소의 기존 장소/제보가 있으면 중복 제출을 막는다
      const dup = await checkPlaceDuplicate(address.trim());
      if (dup) {
        track.placeSubmissionAttempted({
          source,
          result: dup === 'approved' ? 'duplicate_approved' : 'duplicate_pending',
        });
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

      track.placeSubmissionAttempted({ source, result: 'submitted' });
      track.placeSubmitted({
        category,
        source,
      });
      accepted = true;

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
      if (!accepted) track.placeSubmissionAttempted({ source, result: 'error' });
      toast.error('제보에 실패했습니다.', error.message);
    } finally {
      setSubmitting(false);
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
        contentContainerStyle={[styles.content, { paddingTop: headerInset + 20 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Text style={[styles.sectionTitle, { color: colors.text }]}>카테고리 *</Text>
        <View style={styles.categories}>
          {CATEGORY_LIST.map((cat) => (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: category === cat.key }}
              onPress={() => setCategory(cat.key)}
              style={({ pressed }) => [
                styles.categoryChip,
                {
                  backgroundColor: category === cat.key ? cat.color : colors.surfaceMuted,
                  borderColor: category === cat.key ? cat.color : colors.border,
                  opacity: pressed ? 0.7 : 1,
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
        <Pressable accessibilityRole="button" accessibilityLabel="장소 검색"
          onPress={() => setAddressModalVisible(true)}
          style={({ pressed }) => [...inputStyle, { opacity: pressed ? 0.7 : 1 }]}>
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="장소 제보하기"
          accessibilityState={{ disabled: submitting, busy: submitting }}
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: colors.tint, opacity: submitting ? 0.6 : pressed ? 0.7 : 1 },
          ]}>
          <Text accessibilityElementsHidden={submitting} importantForAccessibility={submitting ? 'no-hide-descendants' : 'auto'}
            style={[styles.submitText, { color: colors.background, opacity: submitting ? 0 : 1 }]}>장소 제보하기</Text>
          {submitting && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ActivityIndicator color={colors.background} style={{ flex: 1 }} />
          </View>}
        </Pressable>
        <TabScrollSpacer />
      </ScrollView>
      <AddressSearchModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        onSelect={(r) => {
          setAddress(r.roadAddress || r.address);
          setCoords({ latitude: r.latitude, longitude: r.longitude });
          const identity = generalPlaceIdentity({ name: r.placeName, address: r.roadAddress || r.address,
            latitude: r.latitude, longitude: r.longitude, providerId: r.providerId });
          setSourceIdentity({ provider: r.generalPlaceSource?.provider ?? identity.provider,
            placeId: r.generalPlaceSource?.providerId ?? identity.providerId });
          // 장소명은 검색 결과가 정한다(다시 선택하면 갱신). 카카오에 없는
          // 장소(뷰포인트 등)를 위해 필드 자체는 수정 가능하게 둔다.
          if (r.placeName) setName(r.placeName);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function SubmitScreen() {
  const headerInset = useContentHeaderInset();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const [submitType, setSubmitType] = useState<SubmitType>('place');
  const { submitType: requestedType, submitTs, prefillSource, prefillTs } = useLocalSearchParams<{
    submitType?: string;
    submitTs?: string;
    prefillSource?: string;
    prefillTs?: string;
  }>();
  const loginGateKey = useRef<string | null>(null);

  // 도착·일반 장소·빈 검색에서 들어온 제보가 로그인 벽에 막히면 버튼 시도가 없다.
  useEffect(() => {
    if (user) return;
    if (prefillSource !== 'arrival' && prefillSource !== 'temp_place' && prefillSource !== 'search_empty') return;
    const key = `${prefillSource}:${prefillTs ?? submitTs ?? ''}`;
    if (loginGateKey.current === key) return;
    loginGateKey.current = key;
    track.placeSubmissionAttempted({ source: prefillSource, result: 'login' });
  }, [user, prefillSource, prefillTs, submitTs]);

  // 다른 화면의 CTA에서 제보 탭을 열 때, 이전에 보던 위험·건의 탭이 남지 않게 한다.
  // 같은 장소 CTA를 다시 눌러도 timestamp가 바뀌므로 매번 장소 탭으로 돌아온다.
  useEffect(() => {
    if (
      requestedType === 'place' ||
      requestedType === 'hazard' ||
      requestedType === 'feedback'
    ) {
      setSubmitType(requestedType);
    } else if (requestedType === 'course' || requestedType === 'riding') {
      // 구버전 링크가 제거된 메뉴나 빈 화면을 열지 않도록 장소 제보로 안내한다.
      setSubmitType('place');
    }
  }, [requestedType, submitTs]);

  if (!user) {
    return <LoginPrompt message="제보하려면 로그인이 필요합니다." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <HeaderInsetContext.Provider value={headerInset + 60}>
        {submitType === 'place' && <SubmitPlace />}
        {submitType === 'hazard' && <SubmitHazard />}
        {submitType === 'feedback' && <SubmitFeedback />}
      </HeaderInsetContext.Provider>
      <View style={[styles.tabRow, { top: headerInset }]}>
        <HeaderBackdrop />
        <SubmitTypeTab type="place" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="hazard" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="feedback" current={submitType} onPress={setSubmitType} />
      </View>
    </View>
  );
}

export default withNativeTabScreen(SubmitScreen, { title: '제보' });

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    position: 'absolute', left: 0, right: 0, zIndex: 5, overflow: 'hidden',
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
