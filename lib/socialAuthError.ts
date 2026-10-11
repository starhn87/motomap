function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** SDK의 확인된 취소 코드만 조용히 처리한다. 알 수 없는 실패는 취소로 숨기지 않는다. */
export function isSocialAuthCancelled(error: unknown): boolean {
  return ['ERR_REQUEST_CANCELED', 'Cancelled', 'AccessDenied', 'access_denied'].includes(errorCode(error) ?? '');
}

/** 공급자 응답·콜백 URL·토큰을 사용자 문구에 포함하지 않는다. */
export function friendlySocialAuthError(error: unknown): string {
  const code = errorCode(error);
  if (code === 'identity_already_exists' || code === 'email_exists') {
    return '이미 다른 계정에 연결된 로그인 수단이에요. 기존 로그인 방식으로 접속해 주세요.';
  }
  if (code === 'provider_disabled' || code === 'validation_failed') {
    return '이 로그인 수단은 현재 이용할 수 없어요. 다른 로그인 방식을 선택해 주세요.';
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return '요청이 많아 잠시 기다려야 해요. 잠시 후 다시 시도해 주세요.';
  }
  return '로그인을 완료하지 못했어요. 연결 상태를 확인하거나 다른 로그인 방식을 선택해 주세요.';
}
