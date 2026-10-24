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
  const vias = snapshot.vias.map((via): NavTarget => ({
    ...via,
    placeId: viaPlaces.find((place) => samePoint(place, via))?.placeId,
  }));
  return {
    goal: { ...snapshot.goal, ...(samePoint(snapshot.goal, goal) ? goal : {}) },
    start: snapshot.start ? [snapshot.start.longitude, snapshot.start.latitude] : null,
    startName: null,
    userVias: vias.length <= 3 ? vias : [],
    courseVias: vias.length > 3 ? vias.flatMap((via) => [via.longitude, via.latitude]) : [],
    courseId: samePoint(snapshot.goal, goal) ? goal.courseId : undefined,
  };
}

export function continuedViaPlaces(snapshot: GuidePreviewSnapshot, previous: GuideViaPlace[], remaining: (NavTarget | null)[], usedVias: number[]): GuideViaPlace[] {
  const passed = previous.filter((place) => snapshot.passedVias.some((via) => samePoint(place, via)));
  const candidates = [...remaining, ...previous.filter((place) => snapshot.vias.some((via) => samePoint(place, via)))];
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
  return { ...goal, courseId: samePoint(original, snapshot.goal) && samePoint(snapshot.goal, goal) && sameVias ? original.courseId : undefined };
}
