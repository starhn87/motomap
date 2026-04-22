import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/api/reports';

interface Props {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

export default function ReportSheet({ visible, onClose, targetType, targetId }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setReason(null);
    setDescription('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('알림', '신고 사유를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({ targetType, targetId, reason, description });
      Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 조치됩니다.');
      handleClose();
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '신고에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
              borderColor: colors.border,
            },
          ]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>신고하기</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            신고 사유를 선택해주세요
          </Text>

          <View style={styles.reasonList}>
            {REPORT_REASONS.map((opt) => {
              const selected = reason === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setReason(opt.key)}
                  style={({ pressed }) => [
                    styles.reasonItem,
                    {
                      backgroundColor: selected
                        ? colors.tint
                        : colorScheme === 'dark'
                          ? '#0F0F0F'
                          : '#F9FAFB',
                      borderColor: selected ? colors.tint : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.reasonText,
                      { color: selected ? colors.background : colors.text },
                    ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colorScheme === 'dark' ? '#0F0F0F' : '#F9FAFB',
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="상세 설명 (선택)"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <View style={styles.buttons}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.tint,
                  opacity: submitting || pressed ? 0.6 : 1,
                },
              ]}>
              <Text style={[styles.submitText, { color: colors.background }]}>
                {submitting ? '제출 중...' : '제출'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  reasonList: {
    gap: 8,
    marginBottom: 16,
  },
  reasonItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
