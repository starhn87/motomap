import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateReview } from '@/hooks/useReviews';
import { pickImages, uploadMultipleImages } from '@/lib/uploadImage';
import { toast } from '@/lib/toast';
import StarRating from './StarRating';
import PhotoDragList from './PhotoDragList';

interface Props {
  placeId: string;
}

export default function ReviewForm({ placeId }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { mutateAsync } = useCreateReview();

  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  // isPending(mutation)만으로는 사진 업로드 구간이 비어 연타로 중복 등록됐다 —
  // 업로드부터 등록까지 전 과정을 잠근다
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <Text style={[styles.loginHint, { color: colors.textSecondary }]}>
        리뷰를 작성하려면 로그인이 필요합니다.
      </Text>
    );
  }

  const handleAddPhotos = async () => {
    const remaining = 5 - imageUris.length;
    if (remaining <= 0) {
      toast.info('사진은 최대 5장까지 추가할 수 있습니다.');
      return;
    }
    const uris = await pickImages(remaining);
    if (uris.length > 0) {
      setImageUris((prev) => [...prev, ...uris]);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (rating === 0) {
      toast.info('별점을 선택해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrls: string[] = [];
      if (imageUris.length > 0) {
        photoUrls = await uploadMultipleImages(imageUris, `reviews/${placeId}`);
      }

      await mutateAsync({
        placeId,
        rating,
        content: content.trim(),
        photos: photoUrls,
      });
      setRating(0);
      setContent('');
      setImageUris([]);
      toast.success('리뷰가 등록되었습니다.');
    } catch (error: any) {
      toast.error('리뷰 등록에 실패했습니다.', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>별점</Text>
      <StarRating rating={rating} onRate={setRating} size={32} />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        placeholder="리뷰를 작성해주세요 (선택)"
        placeholderTextColor={colors.textSecondary}
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={3}
      />

      {/* 사진 추가·정렬 영역 */}
      <PhotoDragList uris={imageUris} onChange={setImageUris} onAdd={handleAddPhotos} max={5} />

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.8}
        style={[
          styles.submitButton,
          { backgroundColor: colors.tint, opacity: submitting ? 0.6 : 1 },
        ]}>
        {submitting ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={[styles.submitText, { color: colors.background }]}>리뷰 등록</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  loginHint: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  submitButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
