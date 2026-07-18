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

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useReviews, useUpdateReview, useDeleteReview } from '@/hooks/useReviews';
import { useBlockedIds, useBlockUser } from '@/hooks/useBlocks';
import { pickImages, uploadImage } from '@/lib/uploadImage';
import { toast } from '@/lib/toast';
import ReportSheet from '@/components/report/ReportSheet';
import ImageViewer from '@/components/ui/ImageViewer';
import HighlightPulse from '@/components/ui/HighlightPulse';
import StarRating from './StarRating';
import PhotoDragList from './PhotoDragList';

interface Props {
  placeId: string;
  /** 이 리뷰로 스크롤·강조 — key(nonce)가 바뀔 때마다 다시 반짝인다 */
  highlight?: { id: string; key: string } | null;
  /** 강조 대상 리뷰 카드의 y(리스트 루트 기준)를 부모에 보고 — 스크롤 목표 계산용 */
  onHighlightLayout?: (y: number) => void;
}

export default function ReviewList({ placeId, highlight, onHighlightLayout }: Props) {
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
  const [editPicking, setEditPicking] = useState(false);
  // 사진 업로드 포함 저장 전 과정을 잠가 연타 중복 저장을 막는다
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null);

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

  const handleAddEditPhotos = async () => {
    if (editPicking) return;
    const remaining = 5 - editPhotos.length;
    if (remaining <= 0) {
      toast.info('사진은 최대 5장까지입니다.');
      return;
    }
    setEditPicking(true);
    try {
      const uris = await pickImages(remaining);
      if (uris.length > 0) {
        setEditPhotos((prev) => [...prev, ...uris]);
      }
    } finally {
      setEditPicking(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (savingEdit) return;
    if (editRating === 0) {
      toast.info('별점을 선택해주세요.');
      return;
    }
    setSavingEdit(true);
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
    } finally {
      setSavingEdit(false);
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

        const isHighlight = highlight?.id === review.id;
        return (
          <HighlightPulse
            key={review.id}
            pulseKey={isHighlight ? highlight!.key : undefined}
            // 시트 확장(~200ms 후 시작) + 스크롤(950ms 후 시작)이 끝난 뒤 반짝
            delay={1400}
            tint={colors.tint}
            borderRadius={12}
            onLayout={isHighlight ? (e) => onHighlightLayout?.(e.nativeEvent.layout.y) : undefined}
            style={[
              styles.reviewItem,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewUser}>
                {review.avatarUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setViewer({ photos: [review.avatarUrl!], index: 0 })}>
                    <RNImage source={{ uri: review.avatarUrl }} style={styles.avatarImage} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
                    <Text style={[styles.avatarText, { color: colors.background }]}>
                      {review.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {review.userName}
                  </Text>
                  {review.bikeModel ? (
                    <Text style={[styles.bikeBadge, { color: colors.tint }]}>
                      🏍 {review.bikeModel}
                    </Text>
                  ) : null}
                </View>
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
                <PhotoDragList
                  uris={editPhotos}
                  onChange={setEditPhotos}
                  onAdd={handleAddEditPhotos}
                  max={5}
                  loading={editPicking}
                />
                <View style={styles.editButtons}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelButton}>
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSaveEdit(review.id)}
                    disabled={savingEdit}
                    style={[
                      styles.saveButton,
                      { backgroundColor: colors.tint, opacity: savingEdit ? 0.6 : 1 },
                    ]}>
                    {savingEdit ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <Text style={[styles.saveText, { color: colors.background }]}>저장</Text>
                    )}
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
                      <TouchableOpacity
                        key={`${url}-${i}`}
                        activeOpacity={0.85}
                        onPress={() => setViewer({ photos: review.photos, index: i })}>
                        <RNImage source={{ uri: url }} style={styles.reviewPhoto} />
                      </TouchableOpacity>
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
                        <Text style={[styles.actionText, { color: semantic.danger }]}>삭제</Text>
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
          </HighlightPulse>
        );
      })}
      <ReportSheet
        visible={!!reportingId}
        onClose={() => setReportingId(null)}
        targetType="review"
        targetId={reportingId ?? ''}
      />
      <ImageViewer
        visible={!!viewer}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.index ?? 0}
        onClose={() => setViewer(null)}
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
  bikeBadge: { fontSize: 11, fontWeight: '600', marginTop: 1 },
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
  },
  saveText: { fontSize: 13, fontWeight: '600' },
});
