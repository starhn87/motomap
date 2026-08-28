import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncPendingRideSessions } from '@/lib/rideRecorder';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/useAuthStore';

/** 로그인 복구와 포그라운드 복귀 때 오프라인 라이딩 파일을 조용히 재시도한다. */
export default function RideSessionSync() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId) return;
    const sync = () => {
      void syncPendingRideSessions()
        .then((synced) => {
          if (synced > 0) void queryClient.invalidateQueries({ queryKey: ['ride-sessions'] });
        })
        .catch(() => {});
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [userId]);

  return null;
}
