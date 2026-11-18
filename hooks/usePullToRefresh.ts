import { useEffect, useRef, useState } from 'react';

// 백그라운드 재조회는 iOS의 당겨서 새로고침 UI를 움직이지 않는다.
export function usePullToRefresh(refresh: () => Promise<unknown>, resetKey?: string) {
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    pending.current = false;
    setRefreshing(false);
    return () => { generation.current++; };
  }, [resetKey]);
  const onRefresh = () => {
    if (pending.current) return;
    pending.current = true;
    const current = ++generation.current;
    setRefreshing(true);
    void Promise.resolve().then(refresh).catch(() => {
      // 조회 오류 표시는 각 목록이 기존 쿼리 상태로 담당한다.
    }).finally(() => {
      if (current !== generation.current) return;
      pending.current = false;
      setRefreshing(false);
    });
  };
  return { refreshing, onRefresh };
}
