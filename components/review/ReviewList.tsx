import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReviews, useUpdateReview, useDeleteReview } from '@/hooks/useReviews';
import StarRating from './StarRating';

interface Props {
  placeId: string;
}

export default function ReviewList({ placeId }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { data: reviews, isLoading } = useReviews(placeId);
  const { mutateAsync: updateReview } = useUpdateReview(placeId);
  const { mutateAsync: removeReview } = useDeleteReview(placeId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');

  if (isLoading) {
    return <ActivityIndicator size="small" color={colors.tint} style={{ marginVertical: 16 }} />;
  }

  if (!reviews?.length) {
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요!
      </Text>
    );
  }

  const handleEdit = (review: any) => {
    setEditingId(review.id);
    setEditRating(review.rating);
    setEditContent(review.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRating(0);
    setEditContent('');
  };

  const handleSaveEdit = async (id: string) => {
    if (editRating === 0) {
      Alert.alert('알림', '별점을 선택해주세요.');
      return;
    }
    try {
      await updateReview({ id, rating: editRating, content: editContent.trim() });
      handleCancelEdit();
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '수정에 실패했습니다.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('리뷰 삭제', '정말 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeReview(id);
          } catch (error: any) {
            Alert.alert('오류', error.message ?? '삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {reviews.map((review) => {
        const isOwner = user?.id === review.userId;
        const isEditing = editingId === review.id;

        return (
          <View
            key={review.id}
            style={[
              styles.reviewItem,
              {
                backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewUser}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {review.userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.userName, { color: colors.text }]}>
                  {review.userName}
                </Text>
              </View>
              {!isEditing && (
                <StarRating rating={review.rating} size={14} readonly />
              )}
            </View>

            {isEditing ? (
              <View style={styles.editForm}>
                <StarRating rating={editRating} onRate={setEditRating} size={24} />
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: colorScheme === 'dark' ? '#0F0F0F' : '#FFFFFF',
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  numberOfLines={2}
                />
                <View style={styles.editButtons}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelButton}>
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSaveEdit(review.id)}
                    style={styles.saveButton}>
                    <Text style={styles.saveText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {review.content ? (
                  <Text style={[styles.reviewContent, { color: colors.text }]}>
                    {review.content}
                  </Text>
                ) : null}
                {review.photos.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.reviewPhotos}>
                    {review.photos.map((url, i) => (
                      <Image
                        key={`${url}-${i}`}
                        source={{ uri: url }}
                        style={styles.reviewPhoto}
                      />
                    ))}
                  </ScrollView>
                )}
                <View style={styles.reviewFooter}>
                  <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                    {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                  </Text>
                  {isOwner && (
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => handleEdit(review)}>
                        <Text style={[styles.actionText, { color: colors.tint }]}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(review.id)}>
                        <Text style={[styles.actionText, { color: '#EF4444' }]}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: 16 },
  reviewItem: { padding: 14, borderRadius: 12, borderWidth: 1 },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  userName: { fontSize: 13, fontWeight: '600' },
  reviewContent: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  reviewPhotos: { marginBottom: 8 },
  reviewPhoto: { width: 80, height: 80, borderRadius: 8, marginRight: 6 },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewDate: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 12 },
  actionText: { fontSize: 12, fontWeight: '600' },
  editForm: { gap: 10 },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  cancelText: { fontSize: 13, fontWeight: '600' },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F97316',
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
