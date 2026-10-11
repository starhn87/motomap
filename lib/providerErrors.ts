export type ProviderErrorKind =
  | 'cancelled' | 'offline' | 'timeout' | 'rate_limited' | 'temporary'
  | 'configuration' | 'invalid_request' | 'invalid_response';

/** 공급자 원문·요청 URL·좌표·키를 담지 않는 오류 경계. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly provider: string,
    readonly operation: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
    readonly vendorCode?: string,
  ) {
    super(`${provider}:${operation}:${kind}`);
    this.name = 'ProviderError';
    this.retryable = ['offline', 'timeout', 'temporary'].includes(kind);
  }
}

export function providerHttpError(provider: string, operation: string, status: number): ProviderError {
  const kind: ProviderErrorKind = status === 401 || status === 403
    ? 'configuration'
    : status === 429 ? 'rate_limited'
    : status >= 500 ? 'temporary' : 'invalid_request';
  return new ProviderError(provider, operation, kind, status);
}

/** Edge gateway 인증과 외부 공급자 키 오류를 동일한 설정 장애로 오인하지 않는다. */
export function edgeProviderError(provider: string, operation: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const candidate = error as { name?: unknown; context?: { name?: unknown; status?: unknown } } | null;
  if (candidate?.name === 'AbortError' || candidate?.context?.name === 'AbortError') {
    return new ProviderError(provider, operation, 'timeout');
  }
  const status = candidate?.context?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
    // 사용자 JWT 만료·권한 문제일 수도 있다. 공급자 설정 오류라는 기계 판정 없이 세션을 차단하지 않는다.
    if (status === 401 || status === 403) return new ProviderError(provider, operation, 'invalid_request', status);
    return providerHttpError(provider, operation, status);
  }
  if (candidate?.name === 'FunctionsFetchError' || candidate?.name === 'FunctionsRelayError') {
    return new ProviderError(provider, operation, 'temporary');
  }
  return new ProviderError(provider, operation, 'invalid_response');
}

// 앱 프로세스 단위다. 설정 오류에는 검색어 변경·refetch로 같은 키를 계속 쓰지 않는다.
const configurationFailures = new Map<string, ProviderError>();
export function rememberProviderFailure(error: ProviderError): void {
  if (error.kind === 'configuration') configurationFailures.set(error.provider, error);
}
export function requireProviderAvailable(provider: string): void {
  const failure = configurationFailures.get(provider);
  if (failure) throw failure;
}

export function retryProviderQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && (!(error instanceof ProviderError) || error.retryable);
}

export function friendlyProviderError(error: unknown): string {
  if (error instanceof ProviderError && error.kind === 'configuration') {
    return '이 기능은 현재 점검 중이에요. 다른 기능은 계속 이용할 수 있어요.';
  }
  if (error instanceof ProviderError && error.kind === 'rate_limited') {
    return '요청이 많아 잠시 기다려야 해요. 잠시 후 다시 시도해 주세요.';
  }
  return '정보를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';
}
