import type { GuideGoal, GuideViaPlace } from '@/lib/guideSession';
import type { GuidePreviewSnapshot } from '@/modules/kakao-navi';
import type { ParsedNaviParams } from '@/lib/naviParams';
import type { NavTarget } from '@/lib/navigation';
import { haversine } from '@/lib/distance';

// SDK 좌표 변환 오차만 허용해 장소 ID가 옆 장소에 붙지 않게 한다.
function samePoint(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  return haversine(a, b) < 5;
}

export function guidePreviewInitial(snapshot: GuidePreviewSnapshot, goal: GuideGoal, viaPlaces: GuideViaPlace[]): ParsedNaviParams {
  const vias = snapshot.vias.map((via, index): NavTarget => ({
    ...via,
    ...(snapshot.selectedPoi?.via && index===0 ? snapshot.selectedPoi.point : {}),
    placeId: snapshot.selectedPoi?.via && index===0 ? snapshot.selectedPoi.point.placeId
      : (snapshot.gasViaAdded || snapshot.unregisteredViaAdded) && index === 0 ? undefined : viaPlaces.find((place) => samePoint(place, via))?.placeId,
  }));
  return {
    goal: { ...snapshot.goal, ...(snapshot.selectedPoi && !snapshot.selectedPoi.via ? snapshot.selectedPoi.point : {}),
      ...(!snapshot.goalReplaced && samePoint(snapshot.goal, goal) ? goal : {}) },
    start: snapshot.start ? [snapshot.start.longitude, snapshot.start.latitude] : null,
    startName: null,
    userVias: vias.length <= 3 ? vias : [],
    courseVias: vias.length > 3 ? vias.flatMap((via) => [via.longitude, via.latitude]) : [],
    courseId: !snapshot.goalReplaced && samePoint(snapshot.goal, goal) ? goal.courseId : undefined,
  };
}

export function continuedViaPlaces(snapshot: GuidePreviewSnapshot, previous: GuideViaPlace[], remaining: (NavTarget | null)[], usedVias: number[]): GuideViaPlace[] {
  const passed = previous.filter((place) => snapshot.passedVias.some((via) => samePoint(place, via)));
  const candidates = [...remaining, ...previous.filter((place) => !((snapshot.gasViaAdded || snapshot.unregisteredViaAdded) && snapshot.vias[0] && samePoint(place,snapshot.vias[0])) && snapshot.vias.some((via) => samePoint(place, via)))];
  const selected = candidates.flatMap((via) => {
    if (!via?.placeId) return [];
    for (let i = 0; i + 1 < usedVias.length; i += 2) {
      if (samePoint(via, { longitude: usedVias[i], latitude: usedVias[i + 1] })) {
        return [{ placeId: via.placeId, latitude: via.latitude, longitude: via.longitude }];
      }
    }
    return [];
  });
  return [...passed, ...selected].filter((via, index, list) => list.findIndex((place) => place.placeId === via.placeId) === index);
}

export function continuedGoal(snapshot: GuidePreviewSnapshot, original: GuideGoal, goal: NavTarget, usedVias: number[], passedVias = snapshot.passedVias): GuideGoal {
  const before = [...snapshot.passedVias];
  const newlyPassed = passedVias.filter((point) => {
    const index = before.findIndex((old) => samePoint(old, point));
    if (index < 0) return true;
    before.splice(index, 1); return false;
  });
  const expected = snapshot.vias.filter((point) => {
    const index = newlyPassed.findIndex((passed) => samePoint(point, passed));
    if (index < 0) return true;
    newlyPassed.splice(index, 1); return false;
  });
  const sameVias = expected.length * 2 === usedVias.length && expected.every((via, index) =>
    samePoint(via, { longitude: usedVias[index * 2], latitude: usedVias[index * 2 + 1] }));
  const sameDestination = !snapshot.goalReplaced && samePoint(original, snapshot.goal) && samePoint(snapshot.goal, goal);
  return { ...goal, ...(sameDestination && original.visitIdentity ? { visitIdentity: original.visitIdentity } : {}), courseId: !snapshot.goalReplaced && !(snapshot.gasViaAdded || snapshot.unregisteredViaAdded) && samePoint(original, snapshot.goal) && samePoint(snapshot.goal, goal) && sameVias ? original.courseId : undefined };
}

// 지도 POI는 장소 ID를 주지 않는다. 인접한 예전 장소의 정체성을 상속하지 않는다.
export function proposeGuidePoiPreview(snapshot: GuidePreviewSnapshot, point: GuidePreviewSnapshot['goal'], via: boolean, courseMode: boolean,
  verifiedIdentity?:Pick<GuideGoal,'placeId'|'generalPlaceId'>): GuidePreviewSnapshot {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error('invalid_point');
  const selected = { name: point.name.trim().slice(0, 200) || '선택한 장소', latitude: point.latitude, longitude: point.longitude };
  const selectedPoi=verifiedIdentity?.placeId || verifiedIdentity?.generalPlaceId
    ? {via,point:{...selected,placeId:verifiedIdentity.placeId,
      generalPlaceId:verifiedIdentity.placeId?undefined:verifiedIdentity.generalPlaceId}} : undefined;
  if (via) {
    if (courseMode || snapshot.vias.length >= 3) throw new Error('via_limit');
    return { ...snapshot, vias: [selected, ...snapshot.vias], unregisteredViaAdded: true, selectedPoi };
  }
  return { ...snapshot, goal: selected, goalReplaced: true, vias: courseMode ? [] : snapshot.vias, selectedPoi };
}
