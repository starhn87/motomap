import { randomUUID } from 'expo-crypto';
import { recordPlaceRides, type PlaceRide } from '@/lib/api/rides';
import { recordCourseCompletion } from '@/lib/api/courseLibrary';
import { buildPlaceRidesForArrival } from '@/lib/ridePlaceStats';
import type { GuideGoal, GuideViaPlace } from '@/lib/guideSession';
import { useMyPlacesStore } from '@/stores/useMyPlacesStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { locationUseAllowed, useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
import { queryClient } from '@/lib/queryClient';
import { haversine } from '@/lib/distance';
import { track } from '@/lib/analytics';

type Arrival = { confirmed: boolean; pending?: Promise<void>; rows?: PlaceRide[]; saved?: boolean; courseSaved?: boolean };
const arrivals = new WeakMap<object, Arrival>();

export function hasGuideArrived(goal: GuideGoal) { return arrivals.get(goal.visitIdentity ?? goal)?.confirmed === true; }

export function matchesGuideArrival(goal: GuideGoal, event: { latitude: number; longitude: number; name: string; distance: number }) {
  return event.name === goal.name && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
    && Number.isFinite(event.distance) && event.distance >= 0 && event.distance <= 300
    && haversine(goal, event) < 5;
}

// 안내 유지 중 도착과 나중 종료가 같은 행 id를 공유한다. 네트워크 결과가 모호해도
// 재시도는 INSERT ON CONFLICT DO NOTHING이므로 한 방문을 두 번 세지 않는다.
export function recordGuideArrival(goal: GuideGoal, vias: GuideViaPlace[]): Promise<void> {
  let state = arrivals.get(goal.visitIdentity ?? goal);
  if (!state) { state = { confirmed: true }; arrivals.set(goal.visitIdentity ?? goal, state); }
  if (state.pending) return state.pending;
  const entry = state;
  const revision = useLocationPrivacyStore.getState().revision;
  const userId = useAuthStore.getState().user?.id;
  const valid = () => !!userId && userId === useAuthStore.getState().user?.id && locationUseAllowed()
    && useLocationPrivacyStore.getState().historyAllowed && useLocationPrivacyStore.getState().revision === revision;
  if (!valid()) return Promise.resolve();
  entry.pending = (async () => {
    await useMyPlacesStore.getState().load();
    if (!valid()) return;
    entry.rows ??= buildPlaceRidesForArrival(goal, vias, useMyPlacesStore.getState().places)
      .map(row => ({ ...row, id: randomUUID() }));
    if (!entry.saved) {
      entry.saved = await recordPlaceRides(entry.rows, valid);
      if (entry.saved && valid()) {
        void queryClient.invalidateQueries({ queryKey: ['my-rides', userId] });
        void queryClient.invalidateQueries({ queryKey: ['my-ride-stats', userId] });
        void queryClient.invalidateQueries({ queryKey: ['place-rides'] });
      }
    }
    if (goal.courseId && !entry.courseSaved && valid()) {
      const inserted = await recordCourseCompletion(goal.courseId, valid);
      if (!valid()) return;
      entry.courseSaved = true;
      void queryClient.invalidateQueries({ queryKey: ['course-library', userId] });
      void queryClient.invalidateQueries({ queryKey: ['course-progress', userId, goal.courseId] });
      if (inserted) track.courseCompleted({ course_id: goal.courseId });
    }
  })().catch(() => {
    // 안내를 방해하지 않는다. 종료 시 같은 id로 한 번 더 저장할 수 있다.
  }).finally(() => { entry.pending = undefined; });
  return entry.pending;
}
