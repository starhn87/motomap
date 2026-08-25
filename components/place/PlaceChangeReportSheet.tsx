import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  PLACE_CHANGE_REASONS,
  submitPlaceChangeReport,
  type PlaceChangeReason,
} from '@/lib/api/placeChangeReports';
import { haptics } from '@/lib/haptics';
import { registerPushToken } from '@/lib/push';
import { toast } from '@/lib/toast';
import type { PlaceOperationalStatus } from '@/types';

interface Props {
  visible: boolean;
  placeId: string;
  placeName: string;
  operationalStatus?: PlaceOperationalStatus;
  onClose: () => void;
}

export default function PlaceChangeReportSheet({
  visible,
  placeId,
  placeName,
  operationalStatus,
  onClose,
}: Props) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const didOpenRef = useRef(false);
  const { height: windowHeight } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [reason, setReason] = useState<PlaceChangeReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reasons = PLACE_CHANGE_REASONS.filter((option) =>
    operationalStatus === 'temporarily_closed'
      ? option.key !== 'temporarily_closed'
      : option.key !== 'reopened',
  );

  const resetForm = () => {
    setReason(null);
    setDescription('');
  };

  // 닫힌 인스턴스를 계속 유지해 아래 스와이프·취소·제출 완료가 모두 같은
  // 바텀시트 닫힘 전환을 탄다. 부모 상태는 애니메이션이 끝난 뒤에만 닫는다.
  useLayoutEffect(() => {
    if (visible) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChange = (index: number) => {
    if (index >= 0) {
      didOpenRef.current = true;
    } else if (didOpenRef.current) {
      didOpenRef.current = false;
      resetForm();
      onClose();
    }
  };

  const handleClose = () => {
    if (submitting) return;
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior={submitting ? 'none' : 'close'}
      />
    ),
    [submitting],
  );

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!reason) {
      toast.info('달라진 정보를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await submitPlaceChangeReport({ placeId, reason, description });
      // 승인·반려 결과를 받을 맥락이 분명한 시점에 알림 권한을 확인한다.
      // 내부에서 실패를 삼키므로 제보 접수 결과에는 영향을 주지 않는다.
      await registerPushToken(true);
      haptics.success();
      toast.success('장소 정보 제보가 접수되었습니다.', '확인 후 안전하게 반영할게요.');
      bottomSheetRef.current?.close();
    } catch (error: any) {
      toast.error('장소 정보 제보에 실패했습니다.', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      animateOnMount={false}
      enableDynamicSizing
      maxDynamicContentSize={windowHeight * 0.9}
      enablePanDownToClose={!submitting}
      enableBlurKeyboardOnGesture
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderRadius: 24,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      style={styles.sheet}>
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        bounces={false}
        showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.text }]}>장소 정보 제보</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {placeName}의 달라진 정보를 알려주세요.
          </Text>

          <View style={styles.reasonList}>
            {reasons.map((option) => {
              const selected = reason === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    haptics.selection();
                    setReason(option.key);
                  }}
                  style={({ pressed }) => [
                    styles.reasonItem,
                    {
                      backgroundColor: selected ? colors.tint + '14' : colors.surface,
                      borderColor: selected ? colors.tint : colors.border,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}>
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={21}
                    color={selected ? colors.tint : colors.textSecondary}
                  />
                  <View style={styles.reasonCopy}>
                    <Text style={[styles.reasonLabel, { color: colors.text }]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.reasonDescription, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="확인한 내용을 알려주세요 (선택)"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={500}
            textAlignVertical="top"
          />

          <Text style={[styles.notice, { color: colors.textSecondary }]}>
            제보만으로 장소가 바로 변경되거나 숨겨지지 않아요. 운영자가 직접 확인한 뒤 반영합니다.
          </Text>

          <View style={styles.buttons}>
            <Pressable
              onPress={handleClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed || submitting ? 0.6 : 1 },
              ]}>
              <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.tint, opacity: pressed || submitting ? 0.6 : 1 },
              ]}>
              <Text style={[styles.submitText, { color: colors.background }]}>
                {submitting ? '제보 중...' : '제보하기'}
              </Text>
            </Pressable>
          </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 40,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 5,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
  },
  reasonList: {
    gap: 8,
  },
  reasonItem: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonCopy: {
    flex: 1,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  reasonDescription: {
    fontSize: 12,
  },
  input: {
    minHeight: 82,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  notice: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
