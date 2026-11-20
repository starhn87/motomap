import { toast } from '@/lib/toast';
import type { AuthStatus } from '@/stores/useAuthStore';

// 제출 직전에만 로그인 벽을 연다. true면 이번 제출은 멈춘다.
// 세션 복원 중에는 벽을 열지 않아, 복원을 로그인 성공으로 세지 않는다.
export function holdSubmitForLogin(
  status: AuthStatus,
  userId: string | undefined,
  onRequireLogin: () => void,
): boolean {
  if (userId) return false;
  if (status === 'restoring') {
    toast.info('로그인 상태를 확인하고 있어요.');
    return true;
  }
  onRequireLogin();
  return true;
}
