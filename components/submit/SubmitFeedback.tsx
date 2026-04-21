import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { submitFeedback } from '@/lib/api/feedback';
import type { FeedbackType } from '@/lib/api/feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FEEDBACK_TYPES = [
  { key: 'bug' as const, label: '버그 신고', icon: '🐛' },
  { key: 'feature' as const, label: '기능 건의', icon: '💡' },
  { key: 'general' as const, label: '기타 의견', icon: '💬' },
];

export default function SubmitFeedback() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [type, setType] = useState<FeedbackType | null>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitScale = useSharedValue(1);
  const submitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: submitScale.value }],
  }));

  const handleSubmit = async () => {
    if (!type) {
      Alert.alert('알림', '유형을 선택해주세요.');
      return;
    }
    if (!content.trim()) {
      Alert.alert('알림', '내용을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    submitScale.value = withSpring(0.95);

    try {
      await submitFeedback({ type, content: content.trim() });
      Alert.alert('감사합니다', '소중한 의견이 접수되었습니다.');
      setType(null);
      setContent('');
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
      submitScale.value = withSpring(1);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: colors.text }]}>유형 *</Text>
        <View style={styles.typeRow}>
          {FEEDBACK_TYPES.map((ft) => (
            <Pressable
              key={ft.key}
              onPress={() => setType(ft.key)}
              style={[
                styles.typeChip,
                {
                  backgroundColor:
                    type === ft.key
                      ? colors.tint
                      : colorScheme === 'dark'
                        ? '#1A1A1A'
                        : '#F3F4F6',
                  borderColor: type === ft.key ? colors.tint : colors.border,
                },
              ]}>
              <Text style={styles.typeIcon}>{ft.icon}</Text>
              <Text
                style={[
                  styles.typeLabel,
                  { color: type === ft.key ? colors.background : colors.text },
                ]}>
                {ft.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>내용 *</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          placeholder="불편사항이나 건의사항을 자유롭게 작성해주세요"
          placeholderTextColor={colors.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
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
            {submitting ? '제출 중...' : '의견 보내기'}
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  typeIcon: { fontSize: 16 },
  typeLabel: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 150,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: { fontSize: 16, fontWeight: '700' },
});
