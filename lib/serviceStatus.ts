export type ServiceState = 'suspended' | 'preparing' | 'active';

export interface ServiceStatus {
  schemaVersion: 1;
  status: ServiceState;
  minimumAppVersion: string;
  storeUrl: string;
  message: string;
}

const STATUS_URL = 'https://motomap.kr/service-status';
const STATUS_TIMEOUT_MS = 3000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function parseServiceStatus(value: unknown): ServiceStatus | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    (candidate.status !== 'suspended' &&
      candidate.status !== 'preparing' &&
      candidate.status !== 'active') ||
    typeof candidate.minimumAppVersion !== 'string' ||
    !VERSION_PATTERN.test(candidate.minimumAppVersion) ||
    typeof candidate.storeUrl !== 'string' ||
    typeof candidate.message !== 'string' ||
    candidate.message.length > 200
  ) {
    return null;
  }

  try {
    const storeUrl = new URL(candidate.storeUrl);
    if (storeUrl.protocol !== 'https:' || storeUrl.hostname !== 'apps.apple.com') return null;
  } catch {
    return null;
  }

  return candidate as unknown as ServiceStatus;
}

/** 상태를 읽지 못하면 호출자는 서비스를 열지 않는다. */
export async function fetchServiceStatus(
  fetcher: typeof fetch = fetch,
): Promise<ServiceStatus | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, STATUS_TIMEOUT_MS);
    });
    const request = fetcher(STATUS_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return parseServiceStatus(await response.json());
      })
      .catch(() => null);
    return await Promise.race([request, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 정수형 마케팅 버전만 비교한다. 식별할 수 없는 버전은 통과시키지 않는다. */
export function isVersionAtLeast(current: string | null, minimum: string): boolean {
  if (!current || !VERSION_PATTERN.test(current) || !VERSION_PATTERN.test(minimum)) return false;
  const currentParts = current.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] !== minimumParts[index]) {
      return currentParts[index] > minimumParts[index];
    }
  }
  return true;
}

export function resolveServiceGate(
  status: ServiceStatus | null,
  installedVersion: string | null,
  internalTestFlight = false,
): 'suspended' | 'preparing' | 'update' | 'check-update' {
  if (!status || status.status === 'suspended') return 'suspended';
  // 공개 채널은 준비 중에 열지 않고, 별도 내부 TestFlight 채널만 실기기 검증에 사용한다.
  if (status.status === 'preparing' && !internalTestFlight) return 'preparing';
  return isVersionAtLeast(installedVersion, status.minimumAppVersion) ? 'check-update' : 'update';
}
