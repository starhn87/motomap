import { create } from 'zustand';

import type { RoutePriority } from '@/modules/kakao-navi';

// 진행 중인 길안내의 맥락. 안내 화면이 뜨면 /navi 화면은 지도로 빠져
// 언마운트되므로, 종료·메뉴 이벤트 처리(lib/guideEvents)가 여기서 맥락을 읽는다.
interface GuideGoal {
  latitude: number;
  longitude: number;
  name: string;
  /** 등록 장소면 도착 후 리뷰 연결에 쓴다 */
  placeId?: string;
  /** 코스 안내면 도착 후 코스 리뷰로 잇는다 */
  courseId?: string;
}

interface GuideSessionStore {
  goal: GuideGoal | null;
  priority: RoutePriority;
  start: (goal: GuideGoal, priority: RoutePriority) => void;
  /** 안내 중 목적지 변경(근처 장소) — 도착 판정·리뷰 연결이 새 목적지를 본다 */
  changeGoal: (goal: GuideGoal) => void;
  clear: () => void;
}

export const useGuideSession = create<GuideSessionStore>((set) => ({
  goal: null,
  priority: 0,
  start: (goal, priority) => set({ goal, priority }),
  changeGoal: (goal) => set({ goal }),
  clear: () => set({ goal: null, priority: 0 }),
}));
