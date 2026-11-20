import { useRevealKeyboardInput } from '@/hooks/useRevealKeyboardInput';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/AppText';
import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import AndroidReportReasonRow from '@/components/report/AndroidReportReasonRow';
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/api/reports';
import { toast } from '@/lib/toast';

interface Props {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

export default function ReportSheet({ visible, onClose, targetType, targetId }: Props) {
  const keyboardScrollRef = useRef<ScrollView>(null);
  const keyboardInput = useRevealKeyboardInput(keyboardScrollRef);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isAndroid = Platform.OS === 'android';
  const { bottom } = useSafeAreaInsets();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setReason(null);
    setDescription('');
    onClose();
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!reason) {
      toast.info('신고 사유를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({ targetType, targetId, reason, description });
      toast.success('신고가 접수되었습니다.', '검토 후 조치됩니다.');
      handleClose();
    } catch (error: any) {
      toast.error('신고에 실패했습니다.', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sheetContent = (
    <>
      <View style={[styles.handle, { backgroundColor: colors.border }]} />
      <Text style={[styles.title, { color: colors.text }]}>신고하기</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        신고 사유를 선택해주세요
      </Text>

      <View style={styles.reasonList} accessibilityRole={isAndroid ? 'radiogroup' : undefined}>
        {REPORT_REASONS.map((opt) => {
          const selected = reason === opt.key;
          if (isAndroid) {
            return (
              <AndroidReportReasonRow key={opt.key} label={opt.label} selected={selected}
                disabled={submitting} onPress={() => {
                  Keyboard.dismiss();
                  setReason(opt.key);
                }} />
            );
          }
          return (
            <Pressable
              key={opt.key}
              onPress={() => setReason(opt.key)}
              style={({ pressed }) => [
                styles.reasonItem,
                {
                  backgroundColor: selected ? colors.tint : colors.surface,
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
        onFocus={keyboardInput.onFocus}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
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
            isAndroid && styles.androidFooterButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            isAndroid && styles.androidFooterButton,
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
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} enabled={isAndroid} behavior="height">
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <ScrollView
          ref={keyboardScrollRef}
          automaticallyAdjustKeyboardInsets
          style={[
            styles.sheet,
            isAndroid && styles.androidSheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
          contentContainerStyle={[styles.sheetContent, isAndroid && { paddingBottom: Math.max(32, bottom + 12) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
          showsVerticalScrollIndicator={false}>
          {isAndroid ? sheetContent : (
            <Pressable onPress={Keyboard.dismiss} accessible={false}>{sheetContent}</Pressable>
          )}
        </ScrollView>
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flexShrink: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 32,
  },
  androidSheet: {
    flexGrow: 0,
  },
  androidFooterButton: {
    justifyContent: 'center',
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
