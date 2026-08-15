import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import BikeIcon from '@/components/ui/BikeIcon';
import { useColorScheme } from '@/components/useColorScheme';
import { canonicalBikeModel, searchBikeModels } from '@/constants/bikes';
import Colors from '@/constants/Colors';
import { useMyRideStats } from '@/hooks/usePlaceRides';
import { useUserBikes } from '@/hooks/useUserBikes';
import { track } from '@/lib/analytics';
import {
  createUserBike,
  deleteUserBike,
  setActiveUserBike,
  updateUserBike,
  type UserBike,
} from '@/lib/api/userBikes';
import { getBikeSpec } from '@/lib/bike';
import { appAlert } from '@/lib/dialog';
import { toast } from '@/lib/toast';
import { pickImage, removeUploadedImage, uploadImage } from '@/lib/uploadImage';
import { useAuthStore } from '@/stores/useAuthStore';

interface BikeDraft {
  model: string;
  nickname: string;
  modelYear: string;
  color: string;
}

const EMPTY_DRAFT: BikeDraft = { model: '', nickname: '', modelYear: '', color: '' };

function draftFromBike(bike: UserBike): BikeDraft {
  return {
    model: bike.model,
    nickname: bike.nickname ?? '',
    modelYear: bike.modelYear ? String(bike.modelYear) : '',
    color: bike.color ?? '',
  };
}

function GarageCard({
  bike,
  busy,
  onEdit,
  onActivate,
}: {
  bike: UserBike;
  busy: boolean;
  onEdit: () => void;
  onActivate: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const spec = getBikeSpec(bike.model);
  const details = [bike.modelYear ? `${bike.modelYear}년식` : null, bike.color, spec?.category]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.bikeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {bike.photoUrl ? (
        <Image source={{ uri: bike.photoUrl }} style={styles.bikePhoto} contentFit="cover" />
      ) : (
        <View style={[styles.bikePhoto, styles.bikePlaceholder, { backgroundColor: colors.background }]}>
          <BikeIcon size={44} color={colors.tint} />
        </View>
      )}
      <View style={styles.bikeCardBody}>
        <View style={styles.bikeTitleRow}>
          <View style={styles.bikeTitleBody}>
            <Text style={[styles.bikeName, { color: colors.text }]} numberOfLines={1}>
              {bike.nickname || bike.model}
            </Text>
            {!!bike.nickname && (
              <Text style={[styles.bikeModel, { color: colors.textSecondary }]} numberOfLines={1}>
                {bike.model}
              </Text>
            )}
          </View>
          {bike.isActive && (
            <View style={[styles.activeBadge, { backgroundColor: colors.tint }]}>
              <Text style={[styles.activeBadgeText, { color: colors.background }]}>주행 중</Text>
            </View>
          )}
        </View>
        {!!details && <Text style={[styles.bikeDetails, { color: colors.textSecondary }]}>{details}</Text>}
        <View style={styles.cardActions}>
          {!bike.isActive && (
            <Pressable
              disabled={busy}
              onPress={onActivate}
              style={({ pressed }) => [styles.activateButton, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={[styles.activateText, { color: colors.text }]}>이 바이크로 달리기</Text>
              )}
            </Pressable>
          )}
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [styles.editButton, { opacity: pressed ? 0.5 : 1 }]}>
            <Ionicons name="pencil-outline" size={17} color={colors.textSecondary} />
            <Text style={[styles.editText, { color: colors.textSecondary }]}>편집</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function EditBikeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((state) => state.user)!;
  const queryClient = useQueryClient();
  const { data: bikes, isLoading, error } = useUserBikes();
  const rideStats = useMyRideStats();
  const tracked = useRef(false);

  const [editingBike, setEditingBike] = useState<UserBike | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BikeDraft>(EMPTY_DRAFT);
  const [pickedModel, setPickedModel] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const editorOpen = adding || editingBike !== null;

  useEffect(() => {
    if (!tracked.current && bikes) {
      tracked.current = true;
      track.bikeSetupViewed({ has_bike: bikes.length > 0 });
    }
  }, [bikes]);

  const suggestions = pickedModel
    ? []
    : searchBikeModels(draft.model).filter((model) => model !== draft.model.trim());
  const spec = getBikeSpec(draft.model);

  const refreshBikes = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['user-bikes'] }),
      queryClient.invalidateQueries({ queryKey: ['my-bike'] }),
    ]);
  };

  const closeEditor = () => {
    Keyboard.dismiss();
    setEditingBike(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
    setPendingPhoto(null);
    setRemovePhoto(false);
    setPickedModel(false);
  };

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditingBike(null);
    setPendingPhoto(null);
    setRemovePhoto(false);
    setPickedModel(false);
    setAdding(true);
  };

  const openEdit = (bike: UserBike) => {
    setDraft(draftFromBike(bike));
    setEditingBike(bike);
    setPendingPhoto(null);
    setRemovePhoto(false);
    setPickedModel(true);
    setAdding(false);
  };

  const handlePhoto = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setPendingPhoto(uri);
    setRemovePhoto(false);
  };

  const handleSave = async () => {
    if (saving) return;
    const entered = draft.model.trim();
    if (!entered) {
      toast.error('바이크 기종을 입력해주세요.');
      return;
    }
    const year = draft.modelYear.trim() ? Number(draft.modelYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
      toast.error('연식은 1900~2100 사이 숫자로 입력해주세요.');
      return;
    }

    setSaving(true);
    let uploadedUrl: string | null = null;
    try {
      const model = canonicalBikeModel(entered) ?? entered;
      let photoUrl = removePhoto ? null : editingBike?.photoUrl ?? null;
      if (pendingPhoto) {
        uploadedUrl = await uploadImage(pendingPhoto, `bike-photos/${user.id}`);
        photoUrl = uploadedUrl;
      }
      const input = {
        model,
        nickname: draft.nickname,
        modelYear: year,
        color: draft.color,
        photoUrl,
      };

      if (editingBike) {
        await updateUserBike(editingBike.id, input);
      } else {
        await createUserBike(input, (bikes?.length ?? 0) === 0);
      }

      if (editingBike?.photoUrl && editingBike.photoUrl !== photoUrl) {
        void removeUploadedImage(editingBike.photoUrl);
      }
      const nextSpec = getBikeSpec(model);
      track.bikeSetupSaved({
        action: editingBike ? 'updated' : 'registered',
        canonical: !!canonicalBikeModel(model),
        category: nextSpec?.category,
      });
      track.bikeGarageChanged({
        action: editingBike ? 'edited' : 'added',
        bike_count: (bikes?.length ?? 0) + (editingBike ? 0 : 1),
      });
      await refreshBikes();
      closeEditor();
      toast.success(editingBike ? '바이크 정보를 수정했어요.' : '내 차고에 바이크를 추가했어요.');
    } catch (saveError: any) {
      if (uploadedUrl) void removeUploadedImage(uploadedUrl);
      toast.error('저장에 실패했습니다.', saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (bike: UserBike) => {
    if (activatingId) return;
    setActivatingId(bike.id);
    try {
      await setActiveUserBike(bike.id);
      track.bikeGarageChanged({ action: 'activated', bike_count: bikes?.length ?? 0 });
      await refreshBikes();
      toast.success(`${bike.nickname || bike.model}(으)로 주행 바이크를 바꿨어요.`);
    } catch (activateError: any) {
      toast.error('주행 바이크를 바꾸지 못했습니다.', activateError.message);
    } finally {
      setActivatingId(null);
    }
  };

  const confirmDelete = () => {
    if (!editingBike || saving) return;
    const bike = editingBike;
    appAlert('바이크 삭제', `${bike.nickname || bike.model}을(를) 내 차고에서 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deleteUserBike(bike.id);
            void removeUploadedImage(bike.photoUrl);
            track.bikeGarageChanged({ action: 'removed', bike_count: Math.max((bikes?.length ?? 1) - 1, 0) });
            if ((bikes?.length ?? 0) === 1) {
              track.bikeSetupSaved({ action: 'removed', canonical: true });
            }
            await refreshBikes();
            closeEditor();
            toast.success('바이크를 삭제했어요.');
          } catch (deleteError: any) {
            toast.error('삭제에 실패했습니다.', deleteError.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>내 차고를 불러오지 못했습니다.</Text>
      </View>
    );
  }

  if (editorOpen) {
    const shownPhoto = pendingPhoto ?? (removePhoto ? null : editingBike?.photoUrl ?? null);
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.editorContent}>
          <View style={styles.editorHeading}>
            <View>
              <Text style={[styles.editorTitle, { color: colors.text }]}>
                {editingBike ? '바이크 편집' : '바이크 추가'}
              </Text>
              <Text style={[styles.editorSubtitle, { color: colors.textSecondary }]}>모델명보다 애칭이 먼저 보이도록 꾸밀 수 있어요.</Text>
            </View>
            <Pressable hitSlop={10} onPress={closeEditor}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => void handlePhoto()}
            style={[styles.photoPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {shownPhoto ? (
              <Image source={{ uri: shownPhoto }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <BikeIcon size={54} color={colors.tint} />
                <Text style={[styles.photoHint, { color: colors.textSecondary }]}>바이크 사진 추가</Text>
              </>
            )}
            <View style={styles.photoBadge}>
              <Ionicons name="camera" size={16} color="#18181B" />
            </View>
          </Pressable>
          {!!shownPhoto && (
            <Pressable
              onPress={() => {
                setPendingPhoto(null);
                setRemovePhoto(true);
              }}
              style={styles.removePhotoButton}>
              <Text style={[styles.removePhotoText, { color: colors.textSecondary }]}>사진 삭제</Text>
            </Pressable>
          )}

          <Text style={[styles.label, { color: colors.text }]}>기종 *</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="예: CB650R, R7, 슈퍼커브110"
              placeholderTextColor={colors.textSecondary}
              value={draft.model}
              onChangeText={(model) => {
                setDraft((current) => ({ ...current, model }));
                setPickedModel(false);
              }}
              maxLength={60}
            />
          </View>
          {suggestions.length > 0 && (
            <View style={[styles.suggestions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {suggestions.slice(0, 8).map((model) => (
                <Pressable
                  key={model}
                  onPress={() => {
                    setDraft((current) => ({ ...current, model }));
                    setPickedModel(true);
                    Keyboard.dismiss();
                  }}
                  style={[styles.suggestion, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.suggestionText, { color: colors.text }]}>{model}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {spec && (
            <View style={styles.specChips}>
              {[
                spec.cc ? `${spec.cc}cc` : null,
                spec.category,
                spec.electric ? '전기' : spec.fuelGrade === 'premium' ? '고급휘발유' : spec.fuelGrade ? '일반휘발유' : null,
              ].filter((value): value is string => !!value).map((value) => (
                <View key={value} style={[styles.specChip, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.specChipText, { color: colors.textSecondary }]}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>애칭</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="예: 콩이, 번개"
              placeholderTextColor={colors.textSecondary}
              value={draft.nickname}
              onChangeText={(nickname) => setDraft((current) => ({ ...current, nickname }))}
              maxLength={30}
            />
          </View>

          <View style={styles.halfFields}>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: colors.text }]}>연식</Text>
              <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="2025"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  value={draft.modelYear}
                  onChangeText={(modelYear) => setDraft((current) => ({ ...current, modelYear }))}
                  maxLength={4}
                />
              </View>
            </View>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: colors.text }]}>색상</Text>
              <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="매트 블랙"
                  placeholderTextColor={colors.textSecondary}
                  value={draft.color}
                  onChangeText={(color) => setDraft((current) => ({ ...current, color }))}
                  maxLength={30}
                />
              </View>
            </View>
          </View>

          <Pressable
            disabled={saving}
            onPress={() => void handleSave()}
            style={[styles.saveButton, { backgroundColor: colors.tint, opacity: saving ? 0.6 : 1 }]}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[styles.saveText, { color: colors.background }]}>저장</Text>
            )}
          </Pressable>
          {editingBike && (
            <Pressable disabled={saving} onPress={confirmDelete} style={styles.deleteButton}>
              <Text style={styles.deleteText}>이 바이크 삭제</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.listContent}>
      <View style={styles.listHeading}>
        <View style={styles.listTitleBody}>
          <Text style={[styles.listTitle, { color: colors.text }]}>내 차고</Text>
          <Text style={[styles.listSubtitle, { color: colors.textSecondary }]}>지금 타는 바이크와 함께 쌓인 기록을 관리해요.</Text>
        </View>
        <Pressable
          onPress={openNew}
          style={({ pressed }) => [styles.addButton, { backgroundColor: colors.tint }, pressed && { opacity: 0.75 }]}>
          <Ionicons name="add" size={18} color={colors.background} />
          <Text style={[styles.addText, { color: colors.background }]}>추가</Text>
        </Pressable>
      </View>

      {(bikes?.length ?? 0) === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <BikeIcon size={54} color={colors.tint} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>첫 바이크를 차고에 들여보세요</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>기종과 애칭을 등록하면 리뷰와 주행 기록에 내 정체성이 남아요.</Text>
          <Pressable onPress={openNew} style={[styles.emptyButton, { backgroundColor: colors.tint }]}>
            <Text style={[styles.emptyButtonText, { color: colors.background }]}>내 바이크 등록</Text>
          </Pressable>
        </View>
      ) : (
        bikes!.map((bike) => (
          <GarageCard
            key={bike.id}
            bike={bike}
            busy={activatingId === bike.id}
            onEdit={() => openEdit(bike)}
            onActivate={() => void handleActivate(bike)}
          />
        ))
      )}

      {rideStats.rides > 0 && (
        <Pressable
          onPress={() => {
            track.bikeRideHistoryOpened({ source: 'bike_setup' });
            router.push('/my-rides');
          }}
          style={({ pressed }) => [
            styles.passportCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}>
          <View>
            <Text style={[styles.passportLabel, { color: colors.textSecondary }]}>나의 주행 기록</Text>
            <Text style={[styles.passportValue, { color: colors.text }]}>{rideStats.places}곳 · {rideStats.rides}번 주행</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14 },
  listContent: { padding: 20, paddingBottom: 36, gap: 12 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  listTitleBody: { flex: 1, gap: 4 },
  listTitle: { fontSize: 24, fontWeight: '900' },
  listSubtitle: { fontSize: 13, lineHeight: 19 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  addText: { fontSize: 13, fontWeight: '800' },
  bikeCard: { flexDirection: 'row', gap: 14, padding: 14, borderWidth: 1, borderRadius: 18 },
  bikePhoto: { width: 92, height: 92, borderRadius: 14, overflow: 'hidden' },
  bikePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  bikeCardBody: { flex: 1, minHeight: 92, justifyContent: 'space-between', gap: 7 },
  bikeTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bikeTitleBody: { flex: 1, gap: 2 },
  bikeName: { fontSize: 17, fontWeight: '800' },
  bikeModel: { fontSize: 12.5 },
  activeBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  activeBadgeText: { fontSize: 10.5, fontWeight: '800' },
  bikeDetails: { fontSize: 12 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activateButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 9 },
  activateText: { fontSize: 11.5, fontWeight: '700' },
  editButton: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6 },
  editText: { fontSize: 11.5, fontWeight: '600' },
  emptyCard: { alignItems: 'center', padding: 28, gap: 10, borderWidth: 1, borderRadius: 20 },
  emptyTitle: { marginTop: 4, fontSize: 18, fontWeight: '800' },
  emptySubtitle: { textAlign: 'center', fontSize: 13, lineHeight: 19 },
  emptyButton: { marginTop: 6, borderRadius: 13, paddingHorizontal: 20, paddingVertical: 12 },
  emptyButtonText: { fontSize: 14, fontWeight: '800' },
  passportCard: { marginTop: 6, minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderWidth: 1, borderRadius: 16 },
  passportLabel: { marginBottom: 4, fontSize: 12, fontWeight: '600' },
  passportValue: { fontSize: 15, fontWeight: '800' },
  editorContent: { padding: 20, paddingBottom: 48 },
  editorHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  editorTitle: { fontSize: 23, fontWeight: '900' },
  editorSubtitle: { marginTop: 5, fontSize: 12.5 },
  photoPicker: { height: 180, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  photoHint: { fontSize: 13, fontWeight: '600' },
  photoBadge: { position: 'absolute', right: 12, bottom: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 18 },
  removePhotoButton: { alignSelf: 'flex-end', paddingVertical: 9 },
  removePhotoText: { fontSize: 12.5, fontWeight: '600' },
  label: { marginTop: 14, marginBottom: 7, fontSize: 13, fontWeight: '700' },
  inputRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  suggestions: { maxHeight: 330, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  suggestion: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestionText: { fontSize: 14 },
  specChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  specChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  specChipText: { fontSize: 12, fontWeight: '600' },
  halfFields: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  saveButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 26, borderRadius: 14 },
  saveText: { fontSize: 15, fontWeight: '800' },
  deleteButton: { alignItems: 'center', paddingVertical: 16 },
  deleteText: { color: '#EF4444', fontSize: 13.5, fontWeight: '700' },
});
