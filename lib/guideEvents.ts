import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import KakaoNavi, { MOTOMAP_MENU_ID, friendlyRouteError } from '@/modules/kakao-navi';
import { useGuideSession } from '@/lib/guideSession';
import { HAZARD_LIST } from '@/constants/hazards';
import { submitHazard } from '@/lib/api/hazards';
import { fetchNearbyPlaces } from '@/lib/api/places';
import { formatMeters } from '@/lib/api/directions';
import { haversine } from '@/lib/distance';
import { focusPlaceOnMap, followMyLocationOnMap } from '@/lib/mapFocus';
import { toast } from '@/lib/toast';

// 길안내 전역 이벤트 — 안내가 시작되면 /navi 화면은 지도로 빠져 언마운트되므로
// 종료·메뉴 처리는 화면이 아니라 여기(루트에서 1회 등록)가 맡는다.
// 안내 맥락(목적지·옵션)은 useGuideSession 에서 읽는다.

// 주행 중 위험 제보 — 유형 고르면 현 위치로 바로 제보
async function reportHazard() {
  const picked = await KakaoNavi.showGuideOptions(
    '노면 위험 제보',
    HAZARD_LIST.map((h) => h.label),
  );
  if (picked < 0) return;
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
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

// 안내 종료 — 목적지 400m 이내면 도착으로 보고 리뷰를 제안한다.
// 안내 화면이 걷힐 때 밑에는 이미 지도가 있으므로 화면 전환은 필요 없다.
async function handleGuideEnd() {
  const { goal, clear } = useGuideSession.getState();
  clear();
  // 안내가 끝나도 라이더는 이동 중 — 지도가 내 위치를 따라간다.
  // 드래그하면 SDK 가 따라가기를 알아서 푼다.
  followMyLocationOnMap();
  if (!goal || (!goal.placeId && !goal.courseId)) return;

  let near = false;
  try {
    const pos =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    near =
      haversine(
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        goal,
      ) < 400;
  } catch {
    // 위치를 못 읽으면 조용히 넘어간다 — 제안을 못 띄울 뿐
  }
  if (!near) return;

  // 안내 화면 닫힘 애니메이션이 끝난 뒤 지도 위에서 띄운다
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

/** 루트 레이아웃에서 1회 등록. 반환값은 해제 함수. */
export function registerGuideEvents(): () => void {
  const end = KakaoNavi.addListener('onGuideEnd', () => void handleGuideEnd());
  const failed = KakaoNavi.addListener('onGuideFailed', ({ code, message }) => {
    useGuideSession.getState().clear();
    toast.error('길안내를 시작할 수 없습니다', friendlyRouteError(message, code));
  });
  // 커스텀 슬롯이 하나뿐이라 버튼 하나에서 1차 시트로 가른다
  const menu = KakaoNavi.addListener('onGuideMenu', ({ id }) => {
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
    end.remove();
    failed.remove();
    menu.remove();
  };
}
