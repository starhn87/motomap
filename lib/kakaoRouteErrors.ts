/** KNSDK의 reject 코드에서 경로 실패 숫자만 꺼낸다. 메시지는 분기에 사용하지 않는다. */
export function routeErrorCode(error: unknown): number | null {
  const raw = (error as { code?: unknown } | null)?.code;
  const match = typeof raw === 'string' ? raw.match(/_(\d+)$/) : null;
  return match ? Number(match[1]) : null;
}

/** 공급자 원문을 노출하지 않는 길안내 오류 안내. */
export function friendlyRouteError(error: unknown, knCode?: string | null): string {
  const code = knCode ? Number(knCode) : routeErrorCode(error);
  if (code === 20413) {
    return '자동차 전용도로를 빼면 이어지는 도로가 없어요. 바다 건너나 도로가 끊긴 곳은 안내할 수 없어요.';
  }
  if (code === 20412) {
    return '경유지가 도로와 이어지지 않아요.';
  }
  return '잠시 후 다시 시도해 주세요. 계속 안 된다면 지도로 돌아가 다른 경로를 선택해 주세요.';
}
