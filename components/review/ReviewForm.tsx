import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCreateReview } from '@/hooks/useReviews';
import { pickImage, uploadMultipleImages } from '@/lib/uploadImage';
import StarRating from './StarRating';

interface Props {
  placeId: string;
}

export default function ReviewForm({ placeId }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { mutateAsync, isPending } = useCreateReview();

  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);

  if (!user) {
    return (
      <Text style={[styles.loginHint, { color: colors.textSecondary }]}>
        리뷰를 작성하려면 로그인이 필요합니다.
      </Text>
    );
  }

  const handleAddPhoto = async () => {
    if (imageUris.length >= 5) {
      Alert.alert('알림', '사진은 최대 5장까지 추가할 수 있습니다.');
      return;
    }
    const uri = await pickImage();
    if (uri) {
      setImageUris((prev) => [...prev, uri]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('알림', '별점을 선택해주세요.');
      return;
    }

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
      Alert.alert('완료', '리뷰가 등록되었습니다.');
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '리뷰 등록에 실패했습니다.');
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
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
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

      {/* 사진 추가 영역 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.photoRow}>
          {imageUris.map((uri, index) => (
            <View key={uri} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImage} />
              <TouchableOpacity
                onPress={() => handleRemovePhoto(index)}
                style={styles.photoRemove}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {imageUris.length < 5 && (
            <TouchableOpacity
              onPress={handleAddPhoto}
              style={[
                styles.photoAdd,
                {
                  backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F3F4F6',
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.photoAddIcon, { color: colors.textSecondary }]}>+</Text>
              <Text style={[styles.photoAddText, { color: colors.textSecondary }]}>
                {imageUris.length}/5
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={isPending}
        activeOpacity={0.8}
        style={[styles.submitButton, { backgroundColor: colors.tint, opacity: isPending ? 0.6 : 1 }]}>
        {isPending ? (
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
  photoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoImage: {
    width: 72,
    height: 72,
  },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddIcon: {
    fontSize: 24,
    fontWeight: '300',
  },
  photoAddText: {
    fontSize: 10,
    marginTop: 2,
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
