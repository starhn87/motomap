import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import KakaoNavi, { HAZARD_BUTTON_ID, MOTOMAP_MENU_ID, friendlyRouteError } from '@/modules/kakao-navi';
import { useGuideSession } from '@/lib/guideSession';
import { HAZARD_LIST } from '@/constants/hazards';
import { submitHazard } from '@/lib/api/hazards';
import { fetchNearbyPlaces } from '@/lib/api/places';
import { formatMeters } from '@/lib/api/directions';
import { haversine } from '@/lib/distance';
import { focusPlaceOnMap, followMyLocationOnMap } from '@/lib/mapFocus';
import { recordPlaceRides } from '@/lib/api/rides';
import { toast } from '@/lib/toast';
import { track } from '@/lib/analytics';

// 길안내 전역 이벤트 — 안내가 시작되면 /navi 화면은 지도로 빠져 언마운트되므로
// 종료·메뉴 처리는 화면이 아니라 여기(루트에서 1회 등록)가 맡는다.
// 안내 맥락(목적지·옵션)은 useGuideSession 에서 읽는다.

// 안내 중 앱이 죽으면(강제 종료·크래시) navigation_ended 가 유실된다 — 시작 때
// 마커를 남기고 정상 종료 때 지운다. 다음 실행에서 마커가 남아 있으면 비정상
// 종료였던 것이므로 늦게나마 'abandoned' 로 정산해 완주율 분모를 지킨다.
const GUIDE_ACTIVE_KEY = 'guide-active';

/** 안내가 실제로 시작된 순간(onGuideStarted) 호출 — navi 화면이 부른다 */
export async function markGuideStarted(mode: 'live' | 'preview') {
  await AsyncStorage.setItem(GUIDE_ACTIVE_KEY, mode);
}

async function reconcileAbandonedGuide() {
  const mode = await AsyncStorage.getItem(GUIDE_ACTIVE_KEY);
  if (!mode) return;
  await AsyncStorage.removeItem(GUIDE_ACTIVE_KEY);
  track.navigationEnded({ reason: 'abandoned', mode: mode === 'preview' ? 'preview' : 'live' });
}

// 주행 중 위험 제보 — 유형 고르면 현 위치로 바로 제보
async function reportHazard() {
  // 위치는 버튼을 누른 "순간"에 찍는다. 타입을 고른 뒤에 찍으면 시트를 보며
  // 달린 5~10초(시속 60km 면 100m+)까지 오차에 들어간다 — 위험 지점과의
  // 간격은 어차피 지나친 뒤 누르는 물리적 지연만큼만 남긴다.
  const posPromise = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const picked = await KakaoNavi.showGuideOptions(
    '노면 위험 제보',
    HAZARD_LIST.map((h) => h.label),
  );
  if (picked < 0) return;
  try {
    const pos = await posPromise;
    await submitHazard({
      type: HAZARD_LIST[picked].key,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    void KakaoNavi.showGuideNotice('제보했어요. 안전 운행하세요!');
  } catch {
    void KakaoNavi.showGuideNotice('제보하지 못했어요. 로그인 상태를 확인해주세요.');
  }
}

// 근처 등록 장소로 목적지 변경
async function nearbyPlaces() {
  const { priority, changeGoal } = useGuideSession.getState();
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    const places = (await fetchNearbyPlaces({ ...here, radiusMeters: 5000 }))
      .map((p) => ({ ...p, dist: haversine(here, p) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
    if (places.length === 0) {
      void KakaoNavi.showGuideNotice('5km 안에 등록된 장소가 없어요.');
      return;
    }
    const picked = await KakaoNavi.showGuideOptions(
      '근처 라이더 장소로 안내',
      places.map((p) => `${p.name} · ${formatMeters(p.dist)}`),
    );
    if (picked < 0) return;
    const target = places[picked];
    await KakaoNavi.changeGuideDestination(
      target.longitude,
      target.latitude,
      target.name,
      priority,
    );
    changeGoal({
      latitude: target.latitude,
      longitude: target.longitude,
      name: target.name,
      placeId: target.id,
    });
    void KakaoNavi.showGuideNotice(`${target.name}(으)로 안내를 변경했어요.`);
  } catch {
    void KakaoNavi.showGuideNotice('목적지를 변경하지 못했어요.');
  }
}

type GuideGoal = NonNullable<ReturnType<typeof useGuideSession.getState>['goal']>;

// 종료 지점에서 목적지까지의 거리(m). 위치를 못 읽으면 null — 제안을 못 띄울 뿐
async function distanceToGoal(goal: GuideGoal): Promise<number | null> {
  try {
    const pos =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    return haversine(
      { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
      goal,
    );
  } catch {
    return null;
  }
}

// 도착지 300m 안에서 끝난 라이딩만 장소 통계에 센다 — 도착지와, 지나온
// 등록 장소 경유지에 각각 1회 (완주했으면 경유지도 지난 것으로 본다)
function recordArrival(goal: GuideGoal, viaPlaceIds: string[]) {
  void recordPlaceRides([
    ...(goal.placeId ? [{ place_id: goal.placeId, role: 'goal' as const }] : []),
    ...viaPlaceIds.map((id) => ({ place_id: id, role: 'via' as const })),
    // 등록 장소도 코스도 아니면 일반 장소 도착 — 표시용이 아니라 "라이더가
    // 갔는데 아직 등록 안 된 곳" 신호로만 남긴다(037)
    ...(!goal.placeId && !goal.courseId && goal.name.trim()
      ? [
          {
            role: 'goal' as const,
            name: goal.name.trim(),
            latitude: goal.latitude,
            longitude: goal.longitude,
          },
        ]
      : []),
  ]);
}

// 도착 리뷰 제안 — 안내 화면 닫힘 애니메이션이 끝난 뒤 지도 위에서 띄운다
function suggestReview(goal: GuideGoal) {
  setTimeout(() => {
    Alert.alert(`${goal.name} 도착!`, '어떠셨나요? 리뷰를 남겨보세요.', [
      { text: '나중에', style: 'cancel' },
      {
        text: '리뷰 남기기',
        onPress: () => {
          if (goal.placeId) {
            focusPlaceOnMap(goal.placeId); // 장소 시트로 — 리뷰 작성이 그 안에 있다
          } else if (goal.courseId) {
            router.push(`/course/${goal.courseId}`); // 코스 리뷰 폼은 코스 상세에
          }
        },
      },
    ]);
  }, 500);
}

// 안내 종료 — 목적지 400m 이내면 도착으로 보고 리뷰를 제안한다.
// 안내 화면이 걷힐 때 밑에는 이미 지도가 있으므로 화면 전환은 필요 없다.
async function handleGuideEnd() {
  const { goal, viaPlaceIds, clear } = useGuideSession.getState();
  clear();
  void AsyncStorage.removeItem(GUIDE_ACTIVE_KEY); // 정상 종료 — 정산 대상 아님
  // 안내가 끝나도 라이더는 이동 중 — 지도가 내 위치를 따라간다.
  // 드래그하면 SDK 가 따라가기를 알아서 푼다.
  followMyLocationOnMap();
  if (!goal) {
    track.navigationEnded({ reason: 'cancelled' });
    return;
  }

  const dist = await distanceToGoal(goal);
  const near = dist !== null && dist < 400;
  track.navigationEnded({ reason: near ? 'arrived' : 'cancelled' });
  if (dist !== null && dist <= 300) recordArrival(goal, viaPlaceIds);
  // 리뷰 제안은 등록 장소·코스일 때만 — 그 외 목적지는 조용히 끝낸다
  if (near && (goal.placeId || goal.courseId)) suggestReview(goal);
}

/** 루트 레이아웃에서 1회 등록. 반환값은 해제 함수. */
export function registerGuideEvents(): () => void {
  // 앱 시작 시점 = 직전 실행이 어떻게 끝났든 안내는 이미 없다 — 남은 마커를 정산
  void reconcileAbandonedGuide();
  const end = KakaoNavi.addListener('onGuideEnd', () => void handleGuideEnd());
  const failed = KakaoNavi.addListener('onGuideFailed', ({ code, message }) => {
    useGuideSession.getState().clear();
    toast.error('길안내를 시작할 수 없습니다', friendlyRouteError(message, code));
  });
  // 안내 지도의 POI 탭 — 네이버 지도처럼 "그 장소가 뭔지"에 답하되, 주행
  // 맥락에서 의미 있는 행동(목적지 변경)으로 바로 잇는다. 안내 화면은 네이티브
  // 풀스크린이라 RN 장소 시트를 얹을 수 없다 — 액션시트가 이 화면의 관용구다.
  const poiTap = KakaoNavi.addListener('onGuidePoiTap', ({ name, latitude, longitude }) => {
    void (async () => {
      const label = name.trim() || '선택한 지점';
      const picked = await KakaoNavi.showGuideOptions(label, ['여기로 목적지 변경']);
      if (picked !== 0) return;
      const { priority, changeGoal } = useGuideSession.getState();
      try {
        await KakaoNavi.changeGuideDestination(longitude, latitude, label, priority);
        changeGoal({ latitude, longitude, name: label });
        void KakaoNavi.showGuideNotice(`${label}(으)로 안내를 변경했어요.`);
      } catch {
        void KakaoNavi.showGuideNotice('안내를 변경하지 못했어요.');
      }
    })();
  });

  // 커스텀 슬롯이 하나뿐이라 버튼 하나에서 1차 시트로 가른다
  const menu = KakaoNavi.addListener('onGuideMenu', ({ id }) => {
    // 전용 위험 버튼 — 1차 시트를 건너뛰고 타입 선택으로 직행 (구빌드에는
    // 버튼이 없어 이 id 가 올 일도 없다)
    if (id === HAZARD_BUTTON_ID) {
      void reportHazard();
      return;
    }
    if (id !== MOTOMAP_MENU_ID) return;
    void (async () => {
      const picked = await KakaoNavi.showGuideOptions('모토맵', [
        '위험 제보',
        '근처 장소로 안내',
      ]);
      if (picked === 0) await reportHazard();
      else if (picked === 1) await nearbyPlaces();
    })();
  });
  return () => {
    poiTap.remove();
    end.remove();
    failed.remove();
    menu.remove();
  };
}
