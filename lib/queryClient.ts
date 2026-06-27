import { QueryClient } from '@tanstack/react-query';

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
