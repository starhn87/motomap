import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { NaverMapView, NaverMapPathOverlay } from '@mj-studio/react-native-naver-map';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCourse } from '@/hooks/useCourses';
import { useCourseReviews, useCreateCourseReview, useUpdateCourseReview, useDeleteCourseReview } from '@/hooks/useCourseReviews';
import { useBlockedIds, useBlockUser } from '@/hooks/useBlocks';
import { openNavigation } from '@/lib/navigation';
import { formatDistance, formatDuration } from '@/constants/course';
import { toast } from '@/lib/toast';
import StarRating from '@/components/review/StarRating';
import ReportSheet from '@/components/report/ReportSheet';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((s) => s.user);
  const { data: course, isLoading } = useCourse(id ?? null);
  const { data: reviews } = useCourseReviews(id ?? null);
  const { mutateAsync: submitReview, isPending } = useCreateCourseReview();
  const { mutateAsync: updateReview } = useUpdateCourseReview(id ?? '');
  const { mutateAsync: removeReview } = useDeleteCourseReview(id ?? '');
  const blockedIds = useBlockedIds();
  const { mutateAsync: blockUserFn } = useBlockUser();
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState('');
  const [reportingId, setReportingId] = useState<string | null>(null);

  const handleSubmitReview = async () => {
    if (!id) return;
    if (rating === 0) {
      toast.info('별점을 선택해주세요.');
      return;
    }
    try {
      await submitReview({ courseId: id, rating, content: content.trim() });
      setRating(0);
      setContent('');
      toast.success('리뷰가 등록되었습니다.');
    } catch (error: any) {
      toast.error('리뷰 등록에 실패했습니다.', error.message);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>코스를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const coords = (course.coordinates as [number, number][]).map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  // 지도 카메라 중심 계산
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;

  // 목적지 (마지막 좌표)
  const destination = coords[coords.length - 1];

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {/* 지도 미리보기 */}
      {coords.length >= 2 && (
        <View style={styles.mapContainer}>
          <NaverMapView
            style={styles.map}
            mapType="Basic"
            isNightModeEnabled={colorScheme === 'dark'}
            isShowLocationButton={false}
            isShowCompass={false}
            isShowScaleBar={false}
            isShowZoomControls={false}
            locale="ko"
            initialCamera={{
              latitude: centerLat,
              longitude: centerLng,
              zoom: 9,
            }}>
            <NaverMapPathOverlay
              coords={coords}
              width={5}
              color={colors.tint}
              outlineWidth={2}
              outlineColor={colors.background}
            />
          </NaverMapView>
        </View>
      )}

      {/* 코스 정보 */}
      <View style={styles.info}>
        {course.rating > 0 && (
          <View style={styles.header}>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>★</Text>
              <Text style={[styles.ratingText, { color: colors.text }]}>
                {course.rating}
              </Text>
              <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>
                ({course.reviewCount})
              </Text>
            </View>
          </View>
        )}

        <Text style={[styles.name, { color: colors.text }]}>{course.name}</Text>
        {course.description ? (
          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            {course.description}
          </Text>
        ) : null}

        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDistance(course.distance)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              거리
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDuration(course.duration)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              예상 시간
            </Text>
          </View>
        </View>

        {destination && (
          <Pressable
            onPress={() =>
              openNavigation({
                name: course.name,
                latitude: destination.latitude,
                longitude: destination.longitude,
              })
            }
            style={({ pressed }) => [
              styles.navButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Text style={[styles.navButtonText, { color: colors.background }]}>이 코스로 네비 시작</Text>
          </Pressable>
        )}

        {/* 리뷰 섹션 */}
        <View style={[styles.reviewSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.reviewSectionTitle, { color: colors.text }]}>
            리뷰
          </Text>

          {user ? (
            <View style={styles.reviewForm}>
              <Text style={[styles.reviewFormLabel, { color: colors.text }]}>별점</Text>
              <StarRating rating={rating} onRate={setRating} size={32} />
              <TextInput
                style={[
                  styles.reviewInput,
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
              <Pressable
                onPress={handleSubmitReview}
                disabled={isPending}
                style={({ pressed }) => [
                  styles.reviewSubmitButton,
                  { backgroundColor: colors.tint, opacity: isPending || pressed ? 0.6 : 1 },
                ]}>
                <Text style={[styles.reviewSubmitText, { color: colors.background }]}>
                  {isPending ? '등록 중...' : '리뷰 등록'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.loginHint, { color: colors.textSecondary }]}>
              리뷰를 작성하려면 로그인이 필요합니다.
            </Text>
          )}

          {!(reviews ?? []).filter((r) => !blockedIds.has(r.userId)).length ? (
            <Text style={[styles.emptyReview, { color: colors.textSecondary }]}>
              아직 리뷰가 없습니다. 첫 리뷰를 남겨보세요!
            </Text>
          ) : (
            <View style={styles.reviewList}>
              {reviews!.filter((r) => !blockedIds.has(r.userId)).map((review) => {
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
                        <View style={[styles.reviewAvatar, { backgroundColor: colors.tint }]}>
                          <Text style={[styles.reviewAvatarText, { color: colors.background }]}>
                            {review.userName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.reviewUserName, { color: colors.text }]}>
                          {review.userName}
                        </Text>
                      </View>
                      {!isEditing && <StarRating rating={review.rating} size={14} readonly />}
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
                        <View style={styles.editButtons}>
                          <Pressable
                            onPress={() => { setEditingId(null); }}
                            style={styles.cancelEditButton}>
                            <Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>취소</Text>
                          </Pressable>
                          <Pressable
                            onPress={async () => {
                              if (editRating === 0) { toast.info('별점을 선택해주세요.'); return; }
                              try {
                                await updateReview({ id: review.id, rating: editRating, content: editContent.trim() });
                                setEditingId(null);
                              } catch (e: any) { toast.error('수정에 실패했습니다.', e.message); }
                            }}
                            style={[styles.saveEditButton, { backgroundColor: colors.tint }]}>
                            <Text style={[styles.saveEditText, { color: colors.background }]}>저장</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        {review.content ? (
                          <Text style={[styles.reviewContent, { color: colors.text }]}>
                            {review.content}
                          </Text>
                        ) : null}
                        <View style={styles.reviewFooter}>
                          <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                            {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                          </Text>
                          {isOwner ? (
                            <View style={styles.reviewActions}>
                              <Pressable onPress={() => { setEditingId(review.id); setEditRating(review.rating); setEditContent(review.content); }}>
                                <Text style={[styles.actionText, { color: colors.tint }]}>수정</Text>
                              </Pressable>
                              <Pressable onPress={() => {
                                Alert.alert('리뷰 삭제', '정말 삭제하시겠습니까?', [
                                  { text: '취소', style: 'cancel' },
                                  { text: '삭제', style: 'destructive', onPress: () => removeReview(review.id) },
                                ]);
                              }}>
                                <Text style={[styles.actionText, { color: semantic.danger }]}>삭제</Text>
                              </Pressable>
                            </View>
                          ) : user ? (
                            <View style={styles.reviewActions}>
                              <Pressable onPress={() => setReportingId(review.id)}>
                                <Text style={[styles.actionText, { color: colors.textSecondary }]}>신고</Text>
                              </Pressable>
                              <Pressable onPress={() => {
                                Alert.alert(
                                  `${review.userName} 차단`,
                                  '이 사용자의 리뷰가 더 이상 표시되지 않습니다.',
                                  [
                                    { text: '취소', style: 'cancel' },
                                    {
                                      text: '차단',
                                      style: 'destructive',
                                      onPress: async () => {
                                        try { await blockUserFn(review.userId); }
                                        catch (e: any) { toast.error('차단에 실패했습니다.', e.message); }
                                      },
                                    },
                                  ]
                                );
                              }}>
                                <Text style={[styles.actionText, { color: colors.textSecondary }]}>차단</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
    <ReportSheet
      visible={!!reportingId}
      onClose={() => setReportingId(null)}
      targetType="course_review"
      targetId={reportingId ?? ''}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: {
    height: 280,
  },
  map: {
    flex: 1,
  },
  info: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 14,
    color: semantic.star,
    marginRight: 2,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewCount: {
    fontSize: 12,
    marginLeft: 2,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  navButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  reviewSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    marginTop: 24,
  },
  reviewSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  reviewForm: {
    gap: 12,
    marginBottom: 20,
  },
  reviewFormLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  reviewSubmitButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  reviewSubmitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  loginHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyReview: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
  },
  reviewList: {
    gap: 10,
    marginTop: 8,
  },
  reviewItem: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reviewUserName: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewContent: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  reviewDate: {
    fontSize: 11,
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editForm: {
    gap: 10,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelEditButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveEditButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveEditText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
