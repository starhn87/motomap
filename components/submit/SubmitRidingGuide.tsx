import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NaverMapMarkerOverlay, NaverMapView } from '@mj-studio/react-native-naver-map';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CloseIcon from '@/components/ui/CloseIcon';
import PointSearchModal, { type Point } from '@/components/search/PointSearchModal';
import { GENERAL_MARKER_CIRCLE } from '@/constants/markerImages';
import { submitRidingGuideProposal } from '@/lib/api/ridingGuideSubmissions';
import { registerPushToken } from '@/lib/push';
import { track } from '@/lib/analytics';
import { toast } from '@/lib/toast';

const SUGGESTED_TAGS = [
  '봄',
  '여름',
  '가을',
  '겨울',
  '반나절',
  '해안',
  '와인딩',
  '전망',
  '카페 투어',
] as const;

interface SelectedPlace {
  key: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  generalPlaceId?: string;
  note: string;
}

function splitValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cameraFor(places: SelectedPlace[]) {
  const latitudes = places.map((place) => place.latitude);
  const longitudes = places.map((place) => place.longitude);
  const latitude = (Math.max(...latitudes) + Math.min(...latitudes)) / 2;
  const longitude = (Math.max(...longitudes) + Math.min(...longitudes)) / 2;
  const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const lngSpan = (Math.max(...longitudes) - Math.min(...longitudes)) * 0.8;
  const span = Math.max(latSpan, lngSpan, 0.008);
  return {
    latitude,
    longitude,
    zoom: places.length === 1 ? 13 : Math.min(12, Math.max(7, Math.log2(180 / span) - 1.1)),
  };
}

export default function SubmitRidingGuide() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const titleEdited = useRef(false);
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState('');
  const [primary, setPrimary] = useState<SelectedPlace | null>(null);
  const [stops, setStops] = useState<SelectedPlace[]>([]);
  const [selectionMode, setSelectionMode] = useState<'primary' | 'stop' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allPlaces = primary ? [primary, ...stops] : [];

  const selectPlace = (point: Point, address?: string) => {
    if (point === 'current') return;
    if (!point.placeId && !point.generalPlaceId) {
      toast.error('장소 정보를 저장하지 못했습니다.', '네트워크를 확인한 뒤 다시 선택해주세요.');
      return;
    }

    const key = point.placeId ? `place:${point.placeId}` : `general:${point.generalPlaceId}`;
    const duplicate = allPlaces.some((place) => place.key === key);
    if (duplicate) {
      toast.info('이미 선택한 장소예요.');
      return;
    }

    const selected: SelectedPlace = {
      key,
      name: point.name,
      address: address ?? '',
      latitude: point.latitude,
      longitude: point.longitude,
      placeId: point.placeId,
      generalPlaceId: point.generalPlaceId,
      note: '',
    };
    if (selectionMode === 'primary') {
      setPrimary(selected);
      if (!titleEdited.current) setTitle(`${point.name}로 가는 라이딩`);
    } else if (selectionMode === 'stop') {
      setStops((current) => [...current, selected]);
    }
    setSelectionMode(null);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const updateStopNote = (key: string, note: string) => {
    setStops((current) =>
      current.map((stop) => (stop.key === key ? { ...stop, note } : stop)),
    );
  };

  const reset = () => {
    titleEdited.current = false;
    setTitle('');
    setReason('');
    setSelectedTags([]);
    setCustomTags('');
    setPrimary(null);
    setStops([]);
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!primary) {
      toast.info('대표 목적지를 선택해주세요.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.info('추천 이유를 10자 이상 적어주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const tags = [...new Set([...selectedTags, ...splitValues(customTags)])].slice(0, 12);
      await submitRidingGuideProposal({
        title,
        reason,
        // 구버전 제안과 운영 편집 계약은 유지하되 새 폼에서는 도로 문구를 받지 않는다.
        featuredRoads: [],
        tags,
        stops: [
          {
            role: 'primary',
            placeId: primary.placeId,
            generalPlaceId: primary.generalPlaceId,
          },
          ...stops.map((stop) => ({
            role: 'stop' as const,
            placeId: stop.placeId,
            generalPlaceId: stop.generalPlaceId,
            note: stop.note,
          })),
        ],
      });
      track.ridingGuideSubmitted({
        place_count: allPlaces.length,
        has_featured_roads: false,
        tag_count: tags.length,
      });
      await queryClient.invalidateQueries({ queryKey: ['my-riding-guide-proposals'] });
      await registerPushToken(true);
      toast.success('라이딩 추천을 보냈습니다.', '추천을 검토한 뒤 알려드릴게요.');
      reset();
    } catch (error: any) {
      toast.error('라이딩 추천을 보내지 못했습니다.', error.message);
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View style={[styles.intro, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="navigate-outline" size={21} color={colors.tint} />
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            출발지는 사람마다 달라 고정 경로를 저장하지 않아요. 목적지와 달리기 좋은 이유를
            알려주세요.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>대표 목적지 *</Text>
        {primary ? (
          <View
            style={[
              styles.placeCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <View style={styles.placeCopy}>
              <Text style={[styles.placeName, { color: colors.text }]}>{primary.name}</Text>
              {!!primary.address && (
                <Text style={[styles.placeAddress, { color: colors.textSecondary }]} numberOfLines={1}>
                  {primary.address}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                setPrimary(null);
                if (!titleEdited.current) setTitle('');
              }}
              hitSlop={8}
              style={styles.removeButton}>
              <CloseIcon size={13} color={semantic.danger} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setSelectionMode('primary')}
            style={({ pressed }) => [
              styles.placePicker,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <Ionicons name="search" size={18} color={colors.tint} />
            <Text style={[styles.placePickerText, { color: colors.text }]}>장소 검색하기</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>추천 이유 *</Text>
        <TextInput
          style={[...inputStyle, styles.reasonInput]}
          placeholder="경치, 도로 흐름, 휴식이나 음식처럼 실제 라이딩에서 좋았던 점을 알려주세요"
          placeholderTextColor={colors.textSecondary}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={3000}
          textAlignVertical="top"
        />
        <Text style={[styles.counter, { color: colors.textSecondary }]}>{reason.trim().length}/3000</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>제안 제목</Text>
        <TextInput
          style={inputStyle}
          placeholder="대표 목적지를 고르면 자동으로 채워져요"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={(value) => {
            titleEdited.current = true;
            setTitle(value);
          }}
          maxLength={100}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>함께 들를 곳</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          표시 순서일 뿐 필수 경유 순서는 아니에요. 최대 7곳까지 추가할 수 있어요.
        </Text>
        {stops.map((stop) => (
          <View key={stop.key} style={[styles.stopCard, { borderColor: colors.border }]}>
            <View style={styles.stopHeader}>
              <View style={styles.placeCopy}>
                <Text style={[styles.placeName, { color: colors.text }]}>{stop.name}</Text>
                {!!stop.address && (
                  <Text style={[styles.placeAddress, { color: colors.textSecondary }]} numberOfLines={1}>
                    {stop.address}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() =>
                  setStops((current) => current.filter((item) => item.key !== stop.key))
                }
                hitSlop={8}
                style={styles.removeButton}>
                <CloseIcon size={13} color={semantic.danger} />
              </Pressable>
            </View>
            <TextInput
              style={[...inputStyle, styles.stopNote]}
              placeholder="이곳도 함께 추천하는 이유 (선택)"
              placeholderTextColor={colors.textSecondary}
              value={stop.note}
              onChangeText={(value) => updateStopNote(stop.key, value)}
              maxLength={500}
            />
          </View>
        ))}
        {stops.length < 7 && (
          <Pressable
            onPress={() => setSelectionMode('stop')}
            style={({ pressed }) => [
              styles.addButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <Ionicons name="add" size={18} color={colors.tint} />
            <Text style={[styles.addButtonText, { color: colors.tint }]}>장소 추가</Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>태그</Text>
        <View style={styles.tags}>
          {SUGGESTED_TAGS.map((tag) => {
            const selected = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[
                  styles.tag,
                  {
                    backgroundColor: selected ? colors.tint : colors.surfaceMuted,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.tagText,
                    { color: selected ? colors.background : colors.text },
                  ]}>
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={[...inputStyle, styles.customTags]}
          placeholder="그 밖의 태그를 쉼표로 구분해 입력"
          placeholderTextColor={colors.textSecondary}
          value={customTags}
          onChangeText={setCustomTags}
          maxLength={200}
        />

        {allPlaces.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>장소 미리보기</Text>
            <View style={[styles.mapWrap, { borderColor: colors.border }]}>
              <NaverMapView
                key={allPlaces.map((place) => place.key).join('|')}
                style={styles.map}
                mapType="Basic"
                isNightModeEnabled={colorScheme === 'dark'}
                locationOverlay={{ isVisible: false }}
                isShowLocationButton={false}
                isShowCompass={false}
                isShowScaleBar={false}
                isShowZoomControls={false}
                isScrollGesturesEnabled={false}
                isZoomGesturesEnabled={false}
                isRotateGesturesEnabled={false}
                isTiltGesturesEnabled={false}
                locale="ko"
                initialCamera={cameraFor(allPlaces)}>
                {allPlaces.map((place) => (
                  <NaverMapMarkerOverlay
                    key={place.key}
                    latitude={place.latitude}
                    longitude={place.longitude}
                    image={GENERAL_MARKER_CIRCLE}
                    width={30}
                    height={30}
                    anchor={{ x: 0.5, y: 0.5 }}
                  />
                ))}
              </NaverMapView>
            </View>
          </>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.tint,
              opacity: submitting ? 0.6 : pressed ? 0.78 : 1,
            },
          ]}>
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.submitText, { color: colors.background }]}>라이딩 추천 보내기</Text>
          )}
        </Pressable>
      </ScrollView>

      <PointSearchModal
        visible={selectionMode !== null}
        allowCurrent={false}
        allowSaved
        title={selectionMode === 'primary' ? '대표 목적지' : '함께 들를 곳'}
        onClose={() => setSelectionMode(null)}
        onSelect={selectPlace}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 44 },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  introText: { flex: 1, fontSize: 13, lineHeight: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: -3, marginBottom: 9 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  reasonInput: { minHeight: 112 },
  counter: { alignSelf: 'flex-end', fontSize: 11, marginTop: 5 },
  placePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  placePickerText: { fontSize: 15, fontWeight: '600' },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  placeCopy: { flex: 1, minWidth: 0 },
  placeName: { fontSize: 15, fontWeight: '700' },
  placeAddress: { fontSize: 12, marginTop: 4 },
  removeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  stopCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 9 },
  stopHeader: { flexDirection: 'row', alignItems: 'center' },
  stopNote: { marginTop: 10, paddingVertical: 10, fontSize: 13 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
  },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  tagText: { fontSize: 13, fontWeight: '700' },
  customTags: { marginTop: 10 },
  mapWrap: { height: 220, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  submitButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginTop: 28,
  },
  submitText: { fontSize: 16, fontWeight: '800' },
});
