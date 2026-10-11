import { ProviderError, friendlyProviderError } from '@/lib/providerErrors';

/** 설치한 KNSDK 브리지가 전달하는 코드만 허용한다. 원문 메시지는 읽지 않는다. */
export function kakaoNaviErrorCode(error: unknown): string | undefined {
  if (error instanceof ProviderError) return error.vendorCode;
  const raw = (error as { code?: unknown } | null)?.code;
  return typeof raw === 'string'
    ? raw.match(/^E_KNSDK_(?:INIT|ROUTE|DEST)_([CG]\d{3}|\d{5})$/)?.[1]
    : undefined;
}

export function kakaoNaviProviderError(error: unknown, operation: string): ProviderError {
  if (error instanceof ProviderError) return error;
  const code = kakaoNaviErrorCode(error);
  // C103은 인증뿐 아니라 연결 실패도 포함한다. 메시지 추측으로 영구 차단하지 않는다.
  const kind = code === 'C101' || code === 'G401' ? 'configuration'
    : code === 'G504' ? 'timeout'
    : code === 'C020' || code === 'C103' || code === 'C104' || /^G5\d{2}$/.test(code ?? '')
      ? 'temporary'
    : code === 'G400' || /^20\d{3}$/.test(code ?? '') ? 'invalid_request'
    : 'invalid_response';
  return new ProviderError('kakao-navi', operation, kind, undefined, code);
}

/** KNSDK의 reject 코드에서 경로 실패 숫자만 꺼낸다. 메시지는 분기에 사용하지 않는다. */
export function routeErrorCode(error: unknown): number | null {
  if (error instanceof ProviderError) {
    return /^\d{5}$/.test(error.vendorCode ?? '') ? Number(error.vendorCode) : null;
  }
  const raw = (error as { code?: unknown } | null)?.code;
  const match = typeof raw === 'string' ? raw.match(/_(\d+)$/) : null;
  return match ? Number(match[1]) : null;
}

export function shouldReduceRouteVias(error: unknown): boolean {
  return routeErrorCode(error) === 20412;
}

export function canFallbackToCourseStart(error: unknown): boolean {
  const code = routeErrorCode(error);
  return code === 20410 || code === 20412 || code === 20413;
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
  const failure = kakaoNaviProviderError(error, 'route');
  if (failure.vendorCode === 'UNSUPPORTED') return '이 기기에서는 앱 내 길안내를 지원하지 않습니다.';
  if (failure.kind === 'configuration') return friendlyProviderError(failure);
  return '잠시 후 다시 시도해 주세요. 계속 안 된다면 지도로 돌아가 다른 경로를 선택해 주세요.';
}
