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

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { submitCourse } from '@/lib/api/courses';
import { geocodeAddress } from '@/lib/geocode';
import { toast } from '@/lib/toast';
import AddressSearchModal from '@/components/submit/AddressSearchModal';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Waypoint {
  id: string;
  address: string;
  label: string;
  latitude?: number;
  longitude?: number;
}

export default function SubmitCourse() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [tags, setTags] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { id: '1', address: '', label: '출발지' },
    { id: '2', address: '', label: '도착지' },
  ]);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitScale = useSharedValue(1);
  const submitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: submitScale.value }],
  }));

  const addWaypoint = () => {
    const newId = String(Date.now());
    const newWaypoints = [...waypoints];
    newWaypoints.splice(newWaypoints.length - 1, 0, {
      id: newId,
      address: '',
      label: `경유지 ${waypoints.length - 1}`,
    });
    setWaypoints(newWaypoints);
  };

  const removeWaypoint = (id: string) => {
    setWaypoints(waypoints.filter((w) => w.id !== id));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.info('코스명을 입력해주세요.');
      return;
    }
    const filledWaypoints = waypoints.filter((w) => w.address.trim());
    if (filledWaypoints.length < 2) {
      toast.info('출발지와 도착지를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    submitScale.value = withSpring(0.95);

    try {
      const coordinates: [number, number][] = [];
      for (const wp of filledWaypoints) {
        // 검색으로 좌표를 이미 확보했으면 그대로, 아니면(수동 입력) 지오코딩 fallback
        if (wp.latitude != null && wp.longitude != null) {
          coordinates.push([wp.longitude, wp.latitude]);
          continue;
        }
        const result = await geocodeAddress(wp.address.trim());
        if (!result) {
          toast.error(`"${wp.address}" 주소를 찾을 수 없습니다.`);
          return;
        }
        coordinates.push([result.longitude, result.latitude]);
      }

      await submitCourse({
        name: name.trim(),
        description: description.trim(),
        distance: distance.trim() ? Number(distance) : 0,
        duration: duration.trim() ? Number(duration) : 0,
        coordinates,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });

      toast.success('코스가 등록되었습니다.');

      setName('');
      setDescription('');
      setDistance('');
      setDuration('');
      setTags('');
      setWaypoints([
        { id: '1', address: '', label: '출발지' },
        { id: '2', address: '', label: '도착지' },
      ]);
    } catch (error: any) {
      toast.error('코스 제보에 실패했습니다.', error.message);
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
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          코스명 *
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="예: 양평 6번 국도 코스"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>설명</Text>
        <TextInput
          style={[...inputStyle, styles.multiline]}
          placeholder="코스에 대해 알려주세요"
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              거리(km)
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="45.2"
              placeholderTextColor={colors.textSecondary}
              value={distance}
              onChangeText={setDistance}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              예상 시간(분)
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="60"
              placeholderTextColor={colors.textSecondary}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          경유지 *
        </Text>
        {waypoints.map((wp, index) => (
          <View key={wp.id} style={styles.waypointRow}>
            <View style={[styles.waypointDot, {
              backgroundColor: index === 0 ? semantic.success : index === waypoints.length - 1 ? semantic.danger : '#71717A',
            }]}>
              <Text style={styles.waypointDotText}>{index + 1}</Text>
            </View>
            <Pressable
              onPress={() => setSearchingId(wp.id)}
              style={[...inputStyle, { flex: 1, justifyContent: 'center' }]}>
              <Text style={{ color: wp.address ? colors.text : colors.textSecondary, fontSize: 15 }}>
                {wp.address || wp.label + ' 검색'}
              </Text>
            </Pressable>
            {index > 0 && index < waypoints.length - 1 && (
              <Pressable
                onPress={() => removeWaypoint(wp.id)}
                style={styles.removeButton}>
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}
        <Pressable
          onPress={addWaypoint}
          style={[
            styles.addWaypointButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}>
          <Text style={[styles.addWaypointText, { color: colors.tint }]}>
            + 경유지 추가
          </Text>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>태그</Text>
        <TextInput
          style={inputStyle}
          placeholder="쉼표로 구분 (예: 양평, 와인딩, 카페투어)"
          placeholderTextColor={colors.textSecondary}
          value={tags}
          onChangeText={setTags}
        />

        <AnimatedPressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[
            styles.submitButton,
            submitStyle,
            { backgroundColor: colors.tint, opacity: submitting ? 0.6 : 1 },
          ]}>
          <Text style={[styles.submitText, { color: colors.background }]}>
            {submitting ? '제보 중...' : '코스 제보하기'}
          </Text>
        </AnimatedPressable>
      </ScrollView>
      <AddressSearchModal
        visible={searchingId !== null}
        onClose={() => setSearchingId(null)}
        onSelect={(r) => {
          setWaypoints((prev) =>
            prev.map((w) =>
              w.id === searchingId
                ? { ...w, address: r.roadAddress || r.address, latitude: r.latitude, longitude: r.longitude }
                : w
            )
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  rowInputs: { flexDirection: 'row', gap: 12 },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  waypointDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointDotText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${semantic.danger}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: semantic.danger, fontSize: 14, fontWeight: '700' },
  addWaypointButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addWaypointText: { fontSize: 14, fontWeight: '600' },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: { fontSize: 16, fontWeight: '700' },
});
