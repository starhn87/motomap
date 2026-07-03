import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState } from 'react';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { CATEGORY_LIST } from '@/constants/categories';
import { submitPlace } from '@/lib/api/places';
import { toast } from '@/lib/toast';
import LoginPrompt from '@/components/auth/LoginPrompt';
import SubmitCourse from '@/components/submit/SubmitCourse';
import SubmitFeedback from '@/components/submit/SubmitFeedback';
import AddressSearchModal from '@/components/submit/AddressSearchModal';
import type { PlaceCategory } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SubmitType = 'place' | 'course' | 'feedback';

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
    course: '코스',
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
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [parkingInfo, setParkingInfo] = useState('');
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitScale = useSharedValue(1);
  const submitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: submitScale.value }],
  }));

  const handleSubmit = async () => {
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
      await submitPlace({
        name: name.trim(),
        description: description.trim(),
        category,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: [address.trim(), addressDetail.trim()].filter(Boolean).join(' '),
        phone: phone.trim() || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        openingHours: openingHours.trim() || undefined,
        parkingInfo: parkingInfo.trim() || undefined,
      });

      toast.success('제보가 접수되었습니다.', '관리자 승인 후 지도에 표시됩니다.');

      setName('');
      setDescription('');
      setCategory(null);
      setAddress('');
      setCoords(null);
      setAddressDetail('');
      setPhone('');
      setTags('');
      setOpeningHours('');
      setParkingInfo('');
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
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
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
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[styles.categoryLabel, { color: category === cat.key ? colors.background : colors.text }]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>장소명 *</Text>
        <TextInput style={inputStyle} placeholder="예: 라이더스 카페" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>주소 *</Text>
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

        <Text style={[styles.sectionTitle, { color: colors.text }]}>설명</Text>
        <TextInput style={[...inputStyle, styles.multiline]} placeholder="이 장소에 대해 알려주세요" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} multiline numberOfLines={3} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>태그</Text>
        <TextInput style={inputStyle} placeholder="쉼표로 구분 (예: 넓은주차장, 헬멧보관)" placeholderTextColor={colors.textSecondary} value={tags} onChangeText={setTags} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>전화번호</Text>
        <TextInput style={inputStyle} placeholder="02-1234-5678" placeholderTextColor={colors.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>영업시간</Text>
        <TextInput style={inputStyle} placeholder="09:00 - 22:00" placeholderTextColor={colors.textSecondary} value={openingHours} onChangeText={setOpeningHours} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>주차 정보</Text>
        <TextInput style={inputStyle} placeholder="바이크 전용 주차 20대" placeholderTextColor={colors.textSecondary} value={parkingInfo} onChangeText={setParkingInfo} />

        <AnimatedPressable onPress={handleSubmit} disabled={submitting} style={[styles.submitButton, submitStyle, { backgroundColor: colors.tint, opacity: submitting ? 0.6 : 1 }]}>
          <Text style={[styles.submitText, { color: colors.background }]}>{submitting ? '제보 중...' : '장소 제보하기'}</Text>
        </AnimatedPressable>
      </ScrollView>
      <AddressSearchModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        onSelect={(r) => {
          setAddress(r.roadAddress || r.address);
          setCoords({ latitude: r.latitude, longitude: r.longitude });
          if (!name.trim()) setName(r.placeName);
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

  if (!user) {
    return <LoginPrompt message="제보하려면 로그인이 필요합니다." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.tabRow}>
        <SubmitTypeTab type="place" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="course" current={submitType} onPress={setSubmitType} />
        <SubmitTypeTab type="feedback" current={submitType} onPress={setSubmitType} />
      </View>

      {submitType === 'place' && <SubmitPlace />}
      {submitType === 'course' && <SubmitCourse />}
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
