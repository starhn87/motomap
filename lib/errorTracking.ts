import type { AppReleaseContext } from '@/lib/appVersion';
import { androidNdkCrashAutocaptureForPlatform, nativeCrashAutocaptureForPlatform } from '@/lib/posthogProject';

/**
 * PostHog 오류 수집.
 * 콘솔 로그와 세션 리플레이는 여기서 켜지 않는다.
 * 네이티브 크래시 이벤트 딕셔너리는 JS before_send가 아니라 플러그인 beforeSend 패치가
 * 전송 전에 지운다. 그 딕셔너리 밖의 바이너리 첨부는 지우지 못한다.
 */

const REDACTED = '[redacted]';

/** 예외 이벤트에서 값 전체를 지울 키. 진단용 type·value·stack 은 문자 치환만 한다. */
const EXCEPTION_SENSITIVE_KEY = /^(?:email|e-?mail|latitude|longitude|lat|lng|lon|coord|coords|coordinate|coordinates|token|access_token|refresh_token|authorization|password|secret|api_key|apikey|cookie|nickname|address|query|review|prompt|chat|input|search|body|message_body|user_input)$/i;

/** 제품 이벤트에서도 값 전체를 지울 키. 검색어 query 는 계측 결정을 유지한다. */
const ALWAYS_SENSITIVE_KEY = /^(?:email|e-?mail|latitude|longitude|lat|lng|lon|coord|coords|coordinate|coordinates|token|access_token|refresh_token|authorization|password|secret|api_key|apikey|cookie)$/i;

export const ERROR_TRACKING_OPTIONS = {
  autocapture: {
    uncaughtExceptions: true,
    unhandledRejections: true,
    // 렌더 경계와 콘솔 수집을 같이 켜면 같은 오류가 두 번 들어간다.
    console: [] as Array<'debug' | 'log' | 'info' | 'warn' | 'error'>,
  },
};

export function errorTrackingOptionsForPlatform(os: string) {
  return {
    autocapture: {
      ...ERROR_TRACKING_OPTIONS.autocapture,
      nativeCrashes: nativeCrashAutocaptureForPlatform(os),
      androidNdkCrashes: androidNdkCrashAutocaptureForPlatform(os),
    },
  };
}

export type ErrorTrackingClient = {
  captureException: (error: unknown, properties?: Record<string, unknown>) => void;
  addExceptionStep?: (message: string, properties?: Record<string, unknown>) => void;
  getReleaseContext: () => AppReleaseContext;
};

type CaptureEventLike = {
  event: string;
  properties?: unknown;
  $set?: unknown;
  $set_once?: unknown;
  [key: string]: unknown;
};

let runtime: ErrorTrackingClient | null = null;

export function attachErrorTrackingRuntime(next: ErrorTrackingClient | null) {
  runtime = next;
}

export function scrubDiagnosticString(value: string): string {
  // 전역 정규식은 lastIndex를 남기므로 호출마다 만든다.
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:phc|phx|sbp|sb_secret|sk_live|sk_test|rk_live|rk_test)_[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(/ExponentPushToken\[[^\]]+\]/g, REDACTED)
    .replace(/(?<![A-Za-z0-9.])-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}(?![A-Za-z0-9.])/g, REDACTED);
}

function isExceptionEvent(event: CaptureEventLike): boolean {
  return event.event === '$exception';
}

function scrubNode(value: unknown, key: string | null, exceptionEvent: boolean, depth: number, seen: WeakSet<object>): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return scrubDiagnosticString(value);
  if (typeof value === 'number') {
    if (key && (exceptionEvent ? EXCEPTION_SENSITIVE_KEY : ALWAYS_SENSITIVE_KEY).test(key)) return REDACTED;
    return value;
  }
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubNode(item, key, exceptionEvent, depth + 1, seen));
  }
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(source)) {
    if (childKey === 'token' && typeof child === 'string' && child.startsWith('phc_')) {
      // 수집 토큰을 지우면 SDK가 이벤트 자체를 버린다.
      next[childKey] = child;
      continue;
    }
    const sensitive = exceptionEvent ? EXCEPTION_SENSITIVE_KEY.test(childKey) : ALWAYS_SENSITIVE_KEY.test(childKey);
    next[childKey] = sensitive ? REDACTED : scrubNode(child, childKey, exceptionEvent, depth + 1, seen);
  }
  return next;
}

/** JS로 만들어지는 이벤트에만 적용된다. 네이티브 크래시 원문은 통과하지 않는다. */
export function scrubCaptureEvent(event: CaptureEventLike | null): CaptureEventLike | null {
  if (!event) return event;
  try {
    const exceptionEvent = isExceptionEvent(event);
    const seen = new WeakSet<object>();
    const next: CaptureEventLike = { ...event };
    if ('properties' in event) next.properties = scrubNode(event.properties, null, exceptionEvent, 0, seen);
    if ('$set' in event) next.$set = scrubNode(event.$set, null, exceptionEvent, 0, seen);
    if ('$set_once' in event) next.$set_once = scrubNode(event.$set_once, null, exceptionEvent, 0, seen);
    return next;
  } catch {
    return event.event === '$exception' ? null : event;
  }
}

function scrubHandledProperties(properties: Record<string, string | number | boolean | null | undefined> | undefined) {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (value === undefined) continue;
    if (EXCEPTION_SENSITIVE_KEY.test(key) || ALWAYS_SENSITIVE_KEY.test(key)) continue;
    clean[key] = typeof value === 'string' ? scrubDiagnosticString(value) : value;
  }
  return clean;
}

function scrubError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const copy = new Error(scrubDiagnosticString(error.message));
  copy.name = scrubDiagnosticString(error.name);
  if (error.stack) copy.stack = scrubDiagnosticString(error.stack);
  return copy;
}

export function captureHandledException(
  error: unknown,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!runtime) return;
  try {
    runtime.captureException(scrubError(error), {
      ...runtime.getReleaseContext(),
      ...scrubHandledProperties(properties),
      handled: true,
    });
  } catch {
    // 보고 실패가 원래 흐름을 막지 않는다.
  }
}

/** 네이티브 크래시가 읽을 수 있는 공식 예외 단계에 릴리스 문맥만 남긴다. */
export function recordReleaseExceptionStep() {
  if (!runtime?.addExceptionStep) return;
  try {
    runtime.addExceptionStep('app_release', { ...runtime.getReleaseContext() });
  } catch {
    // 릴리스 태그가 앱 시작의 미처리 예외가 되면 안 된다.
  }
}
