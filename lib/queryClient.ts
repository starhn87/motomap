import { AppState } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

// 앱 전역 단일 QueryClient. 모듈로 분리해 비-React 코드(예: 로그아웃 시
// 캐시 클리어)에서도 참조할 수 있게 한다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 기본 staleTime 0 이면 마운트·포커스마다 재요청한다. 지도/목록이
      // 자주 리마운트되므로 1분 캐시로 중복 왕복을 줄인다. 쓰기 후 신선도는
      // 각 mutation 의 invalidateQueries 가 보장한다.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

// RN 에는 브라우저의 window focus 가 없어 react-query 의 포커스 재조회가 잠들어
// 있다 — AppState 에 연결해 앱이 앞으로 돌아올 때 stale 한 쿼리만 다시 받는다.
// 알림 뱃지가 앱을 껐다 켜야만 갱신되던 것이 이것 때문이었다.
AppState.addEventListener('change', (status) => {
  focusManager.setFocused(status === 'active');
});
