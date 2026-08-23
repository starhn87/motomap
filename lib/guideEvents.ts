import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { appAlert } from '@/lib/dialog';
import * as Location from 'expo-location';

import KakaoNavi, {
  HAZARD_BUTTON_ID,
  MOTOMAP_MENU_ID,
  friendlyRouteError,
  supportsKakaoNaviFeature,
} from '@/modules/kakao-navi';
import { useGuideSession } from '@/lib/guideSession';
import { HAZARD_LIST } from '@/constants/hazards';
import { submitHazard } from '@/lib/api/hazards';
import { fetchNearbyPlaces } from '@/lib/api/places';
import { formatMeters } from '@/lib/api/directions';
import { haversine } from '@/lib/distance';
import { focusPlaceOnMap, focusPointOnMap, followMyLocationOnMap } from '@/lib/mapFocus';
import { recordPlaceRides } from '@/lib/api/rides';
import { toast } from '@/lib/toast';
import { createAnalyticsId, track } from '@/lib/analytics';
import { recordCourseCompletion } from '@/lib/api/courseLibrary';
import { coordToAddress } from '@/lib/api/kakaoLocal';

// 길안내 전역 이벤트 — 안내가 시작되면 /navi 화면은 지도로 빠져 언마운트되므로
// 종료·메뉴 처리는 화면이 아니라 여기(루트에서 1회 등록)가 맡는다.
// 안내 맥락(목적지·옵션)은 useGuideSession 에서 읽는다.

// 안내 중 앱이 죽으면(강제 종료·크래시) navigation_ended 가 유실된다 — 시작 때
// 마커를 남기고 정상 종료 때 지운다. 다음 실행에서 마커가 남아 있으면 비정상
// 종료였던 것이므로 늦게나마 'abandoned' 로 정산해 완주율 분모를 지킨다.
const GUIDE_ACTIVE_KEY = 'guide-active';

type GuideStartEvent = Parameters<typeof track.navigationStarted>[0];
type ActiveGuide = GuideStartEvent & { started_at_ms: number };

function parseActiveGuide(raw: string): ActiveGuide | null {
  // 직전 OTA가 남긴 mode 문자열도 한 번은 정산할 수 있게 호환한다.
  if (raw === 'live' || raw === 'preview') {
    return {
      guide_session_id: createAnalyticsId('guide'),
      mode: raw,
      priority: 0,
      via_count: 0,
      started_at_ms: Date.now(),
    };
  }
  try {
    const value = JSON.parse(raw) as Partial<ActiveGuide>;
    if (
      typeof value.guide_session_id !== 'string' ||
      (value.mode !== 'live' && value.mode !== 'preview') ||
      typeof value.started_at_ms !== 'number'
    ) {
      return null;
    }
    return {
      guide_session_id: value.guide_session_id,
      mode: value.mode,
      priority: typeof value.priority === 'number' ? value.priority : 0,
      via_count: typeof value.via_count === 'number' ? value.via_count : 0,
      ...(typeof value.distance_m === 'number' ? { distance_m: value.distance_m } : {}),
      started_at_ms: value.started_at_ms,
    };
  } catch {
    return null;
  }
}

async function takeActiveGuide(): Promise<ActiveGuide | null> {
  const raw = await AsyncStorage.getItem(GUIDE_ACTIVE_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(GUIDE_ACTIVE_KEY);
  return parseActiveGuide(raw);
}

function trackGuideEnd(
  active: ActiveGuide | null,
  reason: 'arrived' | 'cancelled' | 'abandoned',
) {
  if (!active) return;
  track.navigationEnded({
    guide_session_id: active.guide_session_id,
    reason,
    mode: active.mode,
    duration_s: Math.max(0, Math.round((Date.now() - active.started_at_ms) / 1000)),
    distance_m: active.distance_m,
  });
}

/** 안내가 실제로 시작된 순간(onGuideStarted) 호출 — navi 화면이 부른다 */
export async function markGuideStarted(start: GuideStartEvent) {
  await AsyncStorage.setItem(
    GUIDE_ACTIVE_KEY,
    JSON.stringify({ ...start, started_at_ms: Date.now() } satisfies ActiveGuide),
  );
}

async function reconcileAbandonedGuide() {
  const active = await takeActiveGuide();
  trackGuideEnd(active, 'abandoned');
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
            ...(goal.generalPlaceId
              ? { general_place_id: goal.generalPlaceId }
              : {}),
          },
        ]
      : []),
  ]);
  if (goal.courseId) {
    void recordCourseCompletion(goal.courseId)
      .then((inserted) => {
        if (inserted) track.courseCompleted({ course_id: goal.courseId! });
      })
      .catch(() => {
        // 완주 기록 실패가 안내 종료와 리뷰 제안을 방해하면 안 된다.
      });
  }
}

// 도착 리뷰 제안 — 안내 화면 닫힘 애니메이션이 끝난 뒤 지도 위에서 띄운다
function suggestReview(goal: GuideGoal) {
  setTimeout(() => {
    appAlert(goal.courseId ? `${goal.name} 완주!` : `${goal.name} 도착!`, '어떠셨나요? 리뷰를 남겨보세요.', [
      { text: '나중에', style: 'cancel' },
      {
        text: '리뷰 남기기',
        onPress: () => {
          if (goal.placeId) {
            focusPlaceOnMap(goal.placeId); // 장소 시트로 — 리뷰 작성이 그 안에 있다
          } else if (goal.generalPlaceId) {
            focusPointOnMap({
              name: goal.name,
              latitude: goal.latitude,
              longitude: goal.longitude,
              generalPlaceId: goal.generalPlaceId,
            });
          } else if (goal.courseId) {
            router.push(`/course/${goal.courseId}`); // 코스 리뷰 폼은 코스 상세에
          }
        },
      },
    ]);
  }, 500);
}

// 일반 목적지는 이미 이름·좌표를 알고 있고 주소는 역지오코딩할 수 있다.
// 도착 직후에는 카테고리만 고르면 되도록 제보 폼을 채운 상태로 연다.
async function suggestPlaceSubmission(goal: GuideGoal) {
  const address = await coordToAddress(goal.latitude, goal.longitude);
  setTimeout(() => {
    track.placeSubmissionPrompted({ has_address: !!address });
    appAlert(
      `${goal.name} 도착!`,
      '라이더에게 도움 되는 장소라면 모토맵에 알려주세요. 이름과 위치는 미리 채워둘게요.',
      [
        { text: '나중에', style: 'cancel' },
        {
          text: '장소 제보',
          onPress: () => {
            track.placeSubmissionOpened({ source: 'arrival' });
            router.navigate({
              pathname: '/submit',
              params: {
                prefillName: goal.name,
                ...(address ? { prefillAddress: address } : {}),
                prefillLat: String(goal.latitude),
                prefillLng: String(goal.longitude),
                prefillSource: 'arrival',
                prefillTs: String(Date.now()),
              },
            });
          },
        },
      ],
    );
  }, 500);
}

// 안내 종료 — 목적지 400m 이내면 도착으로 보고 리뷰를 제안한다.
// 안내 화면이 걷힐 때 밑에는 이미 지도가 있으므로 화면 전환은 필요 없다.
async function handleGuideEnd() {
  const { goal, viaPlaceIds, clear } = useGuideSession.getState();
  const active = await takeActiveGuide();
  clear();
  // 안내가 끝나도 라이더는 이동 중 — 지도가 내 위치를 따라간다.
  // 드래그하면 SDK 가 따라가기를 알아서 푼다.
  followMyLocationOnMap();
  if (!goal) {
    trackGuideEnd(active, 'cancelled');
    return;
  }

  const dist = await distanceToGoal(goal);
  const near = dist !== null && dist < 400;
  trackGuideEnd(active, near ? 'arrived' : 'cancelled');
  if (dist !== null && dist <= 300) recordArrival(goal, viaPlaceIds);
  // 등록 장소·코스는 리뷰로, 일반 목적지는 이름·위치가 채워진 간편 제보로 잇는다.
  if (near && (goal.placeId || goal.generalPlaceId || goal.courseId)) suggestReview(goal);
  else if (dist !== null && dist <= 300 && !goal.placeId && !goal.generalPlaceId && !goal.courseId) {
    void suggestPlaceSubmission(goal);
  }
}

/** 루트 레이아웃에서 1회 등록. 반환값은 해제 함수. */
export function registerGuideEvents(): () => void {
  // 앱 시작 시점 = 직전 실행이 어떻게 끝났든 안내는 이미 없다 — 남은 마커를 정산
  void reconcileAbandonedGuide();
  const end = KakaoNavi.addListener('onGuideEnd', () => void handleGuideEnd());
  const failed = KakaoNavi.addListener('onGuideFailed', ({ code, message }) => {
    useGuideSession.getState().clear();
    void takeActiveGuide().then((active) => trackGuideEnd(active, 'cancelled'));
    toast.error('길안내를 시작할 수 없습니다', friendlyRouteError(message, code));
  });
  // 안내 지도의 POI 탭 — 네이버 지도처럼 "그 장소가 뭔지"에 답하되, 주행
  // 맥락에서 의미 있는 행동(목적지 변경)으로 바로 잇는다. 안내 화면은 네이티브
  // 풀스크린이라 RN 장소 시트를 얹을 수 없다 — 액션시트가 이 화면의 관용구다.
  const poiTap = supportsKakaoNaviFeature('guide_poi_tap')
    ? KakaoNavi.addListener('onGuidePoiTap', ({ name, latitude, longitude }) => {
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
      })
    : { remove: () => {} };

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
