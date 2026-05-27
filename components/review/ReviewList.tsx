import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image as RNImage } from 'expo-image';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState } from 'react';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReviews, useUpdateReview, useDeleteReview } from '@/hooks/useReviews';
import { useBlockedIds, useBlockUser } from '@/hooks/useBlocks';
import { pickImage, uploadImage } from '@/lib/uploadImage';
import { toast } from '@/lib/toast';
import ReportSheet from '@/components/report/ReportSheet';
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
  const blockedIds = useBlockedIds();
  const { mutateAsync: blockUserFn } = useBlockUser();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const visibleReviews = reviews?.filter((r) => !blockedIds.has(r.userId));

  if (isLoading) {
    return <ActivityIndicator size="small" color={colors.tint} style={{ marginVertical: 16 }} />;
  }

  if (!visibleReviews?.length) {
    return (
      <Text style={[styles.empty, { color: colors.textSecondary }]}>
        아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요!
      </Text>
    );
  }

  const handleBlock = (userId: string, userName: string) => {
    Alert.alert(
      `${userName} 차단`,
      '이 사용자의 리뷰가 더 이상 표시되지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUserFn(userId);
            } catch (error: any) {
              toast.error('차단에 실패했습니다.', error.message);
            }
          },
        },
      ]
    );
  };

  const handleEdit = (review: any) => {
    setEditingId(review.id);
    setEditRating(review.rating);
    setEditContent(review.content);
    setEditPhotos(review.photos ?? []);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRating(0);
    setEditContent('');
    setEditPhotos([]);
  };

  const handleAddEditPhoto = async () => {
    if (editPhotos.length >= 5) {
      toast.info('사진은 최대 5장까지입니다.');
      return;
    }
    const uri = await pickImage();
    if (uri) {
      setEditPhotos((prev) => [...prev, uri]);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (editRating === 0) {
      toast.info('별점을 선택해주세요.');
      return;
    }
    try {
      const finalPhotos: string[] = [];
      for (const photo of editPhotos) {
        if (photo.startsWith('http')) {
          finalPhotos.push(photo);
        } else {
          const url = await uploadImage(photo, `reviews/${placeId}`);
          finalPhotos.push(url);
        }
      }
      await updateReview({ id, rating: editRating, content: editContent.trim(), photos: finalPhotos });
      handleCancelEdit();
    } catch (error: any) {
      toast.error('수정에 실패했습니다.', error.message);
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
            toast.error('삭제에 실패했습니다.', error.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {visibleReviews.map((review) => {
        const isOwner = user?.id === review.userId;
        const isEditing = editingId === review.id;

        return (
          <View
            key={review.id}
            style={[
              styles.reviewItem,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewUser}>
                {review.avatarUrl ? (
                  <RNImage source={{ uri: review.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
                    <Text style={[styles.avatarText, { color: colors.background }]}>
                      {review.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
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
                      backgroundColor: colors.surfaceElevated,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  numberOfLines={2}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.editPhotoRow}>
                    {editPhotos.map((url, i) => (
                      <TouchableOpacity
                        key={`${url}-${i}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          Alert.alert('사진 삭제', '이 사진을 삭제하시겠습니까?', [
                            { text: '취소', style: 'cancel' },
                            { text: '삭제', style: 'destructive', onPress: () => setEditPhotos((prev) => prev.filter((_, idx) => idx !== i)) },
                          ]);
                        }}
                        style={styles.editPhotoThumb}>
                        <RNImage source={{ uri: url }} style={styles.editPhotoImage} />
                        <View style={styles.editPhotoOverlay}>
                          <Text style={styles.editPhotoOverlayText}>✕</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {editPhotos.length < 5 && (
                      <TouchableOpacity
                        onPress={handleAddEditPhoto}
                        style={[
                          styles.editPhotoAdd,
                          {
                            backgroundColor: colors.surfaceMuted,
                            borderColor: colors.border,
                          },
                        ]}>
                        <Text style={[styles.editPhotoAddText, { color: colors.textSecondary }]}>+</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
                <View style={styles.editButtons}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelButton}>
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSaveEdit(review.id)}
                    style={[styles.saveButton, { backgroundColor: colors.tint }]}>
                    <Text style={[styles.saveText, { color: colors.background }]}>저장</Text>
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
                      <RNImage
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
                  {isOwner ? (
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => handleEdit(review)}>
                        <Text style={[styles.actionText, { color: colors.tint }]}>수정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(review.id)}>
                        <Text style={[styles.actionText, { color: '#EF4444' }]}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  ) : user ? (
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => setReportingId(review.id)}>
                        <Text style={[styles.actionText, { color: colors.textSecondary }]}>신고</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleBlock(review.userId, review.userName)}>
                        <Text style={[styles.actionText, { color: colors.textSecondary }]}>차단</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </View>
        );
      })}
      <ReportSheet
        visible={!!reportingId}
        onClose={() => setReportingId(null)}
        targetType="review"
        targetId={reportingId ?? ''}
      />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: { fontSize: 12, fontWeight: '700' },
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
  editPhotoRow: { flexDirection: 'row', gap: 6 },
  editPhotoThumb: { width: 60, height: 60, borderRadius: 8 },
  editPhotoImage: { width: 60, height: 60, borderRadius: 8 },
  editPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhotoOverlayText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  editPhotoAdd: {
    width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  editPhotoAddText: { fontSize: 20, fontWeight: '300' },
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
  },
  saveText: { fontSize: 13, fontWeight: '600' },
});
