// 중단·업데이트 화면에서도 인증·지도 없이 사용할 수 있는 알림 연결이다.
export const RESUME_NOTIFICATION_KEY = 'service-resume-notification:last-opened';
export const RESUME_PENDING_KEY = 'service-resume-notification:pending';
const INTENT_TTL_MS = 10 * 60 * 1000;

export function isServiceResumeNotification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const payload = data as Record<string, unknown>;
  return payload.type === 'notice' && payload.kind === 'service_resumed' &&
    payload.action === 'update_app';
}

function objectPayload(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.length <= 10_000) {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export type ResumeResponse = {
  actionIdentifier: string;
  notification: { request: {
    identifier: string;
    content: { data?: unknown };
    trigger?: unknown;
  } };
};

/** 가공된 data와 iOS push 원문의 body/data를 같은 순서로 확인한다. */
export function getNotificationResponsePayloads(response: ResumeResponse): Record<string, unknown>[] {
  const request = response.notification.request;
  const candidates = [objectPayload(request.content.data)];
  const trigger = objectPayload(request.trigger);
  if (trigger?.type === 'push') {
    const payload = objectPayload(trigger.payload);
    candidates.push(objectPayload(payload?.body), objectPayload(payload?.data));
  }
  return candidates.filter((value): value is Record<string, unknown> => value !== null);
}

/** iOS의 가공된 data가 없으면 push 원문의 body/data만 엄격하게 확인한다. */
export function isServiceResumeResponse(response: ResumeResponse): boolean {
  return getNotificationResponsePayloads(response).some(isServiceResumeNotification);
}

export type PendingResumeIntent = { identifier: string; expiresAt: number };
export type ResumeStartupOutcome = 'none' | 'opened' | 'failed' | 'pending' | 'unavailable' | 'navigation';
export type ResumeNotificationController = {
  dispose: () => void;
  settleStartup: () => Promise<ResumeStartupOutcome>;
};

type ResumeDependencies = {
  defaultActionIdentifier: string;
  getLastResponse: () => Promise<ResumeResponse | null>;
  listen: (listener: (response: ResumeResponse) => void) => { remove: () => void };
  getHandledId: () => Promise<string | null>;
  setHandledId: (id: string) => Promise<void>;
  getPendingIntent: () => Promise<unknown>;
  setPendingIntent: (intent: PendingResumeIntent) => Promise<void>;
  clearPendingIntent: () => Promise<void>;
  waitForActive: () => Promise<boolean>;
  cancelActiveWait?: () => void;
  openStore: () => Promise<unknown>;
  onOpenFailure?: () => void;
  startupDeadlineMs?: number;
  hasNavigationTarget?: (response: ResumeResponse) => boolean;
};

/** 명시적인 탭을 보존해 OTA/언마운트 뒤 복구하고, 완료한 탭은 재실행하지 않는다. */
export function setupServiceResumeNotification(deps: ResumeDependencies): ResumeNotificationController {
  let disposed = false;
  let responseSequence = 0;
  let handledId: string | null = null;
  let outcome: ResumeStartupOutcome = 'none';
  let queue = Promise.resolve();

  async function openIntent(intent: PendingResumeIntent, sequence: number) {
    if (disposed || sequence !== responseSequence) return;
    let previousId: string | null = null;
    try { previousId = await deps.getHandledId(); } catch { /* 저장 실패는 수동 연결을 막지 않는다. */ }
    if (disposed || sequence !== responseSequence) return;
    if (previousId === intent.identifier || handledId === intent.identifier) {
      outcome = handledId === intent.identifier ? 'opened' : 'none';
      return;
    }
    outcome = 'pending';
    // URL·본문·위치는 저장하지 않는다. 명시적인 탭의 ID와 짧은 만료 시각만 보존한다.
    try { await deps.setPendingIntent(intent); } catch { /* 현재 실행의 연결은 계속 시도한다. */ }
    if (disposed || sequence !== responseSequence) return;
    const active = await deps.waitForActive();
    if (!active || disposed || sequence !== responseSequence) return;
    if (intent.expiresAt <= Date.now()) {
      try { await deps.clearPendingIntent(); } catch { /* 만료된 기록은 다음 조회에서도 무시한다. */ }
      if (!disposed && sequence === responseSequence) outcome = 'none';
      return;
    }
    try {
      // 페이로드 URL은 사용하지 않는다. 대상은 앱의 고정 App Store URL뿐이다.
      await deps.openStore();
      if (disposed || sequence !== responseSequence) return;
      handledId = intent.identifier;
      outcome = 'opened';
      try {
        await deps.setHandledId(intent.identifier);
        await deps.clearPendingIntent();
      } catch { /* 현재 실행의 중복 방지는 유지한다. */ }
    } catch {
      if (!disposed && sequence === responseSequence) {
        outcome = 'failed';
        deps.onOpenFailure?.();
      }
    }
  }

  function enqueue(response: ResumeResponse | null, initial = false, sequence = initial ? 0 : responseSequence) {
    queue = queue.then(async () => {
      if (disposed || sequence !== responseSequence || !response || response.actionIdentifier !== deps.defaultActionIdentifier) return;
      const id = response.notification.request.identifier;
      if (!id) return;
      if (!isServiceResumeResponse(response)) {
        // 일반 알림의 상세 진입도 OTA reload로 native 응답이 사라지지 않게 보호한다.
        outcome = deps.hasNavigationTarget?.(response) ? 'navigation' : 'none';
        try { await deps.clearPendingIntent(); } catch { /* 현재 실행에서는 최신 일반 알림을 우선한다. */ }
        return;
      }
      outcome = 'pending';
      let expiresAt = Date.now() + INTENT_TTL_MS;
      if (initial) {
        // native 캐시의 같은 실패 응답을 다시 읽었다고 탭의 유효 시간을 연장하지 않는다.
        let previous: Record<string, unknown> | null = null;
        try { previous = objectPayload(await deps.getPendingIntent()); } catch { /* 현재 응답은 계속 검사한다. */ }
        if (disposed || sequence !== responseSequence) return;
        if (previous?.identifier === id) {
          if (typeof previous.expiresAt !== 'number' || !Number.isFinite(previous.expiresAt) ||
              previous.expiresAt <= Date.now() || previous.expiresAt > expiresAt) {
            outcome = 'none';
            return;
          }
          expiresAt = previous.expiresAt;
        }
      }
      await openIntent({ identifier: id, expiresAt }, sequence);
    }).catch(() => {});
  }

  function restorePending(responseUnavailable = false) {
    queue = queue.then(async () => {
      if (disposed || responseSequence !== 0) return;
      let value: Record<string, unknown> | null;
      try { value = objectPayload(await deps.getPendingIntent()); }
      catch {
        if (!disposed && responseSequence === 0) outcome = 'unavailable';
        return;
      }
      if (disposed || responseSequence !== 0) return;
      if (!value || typeof value.identifier !== 'string' || !value.identifier ||
          typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) ||
          value.expiresAt <= Date.now() || value.expiresAt > Date.now() + INTENT_TTL_MS) {
        if (responseUnavailable) outcome = 'unavailable';
        return;
      }
      await openIntent({ identifier: value.identifier, expiresAt: value.expiresAt }, 0);
    }).catch(() => {});
  }

  const subscription = deps.listen((response) => {
    // 늦은 콜드 응답·옛 pending이 최신 사용자 탭을 덮어쓰지 않는다.
    responseSequence++;
    deps.cancelActiveWait?.();
    outcome = response.actionIdentifier !== deps.defaultActionIdentifier ? 'none'
      : isServiceResumeResponse(response) ? 'pending'
      : deps.hasNavigationTarget?.(response) ? 'navigation' : 'none';
    enqueue(response, false, responseSequence);
  });
  const startup = deps.getLastResponse().then((response) => {
    if (response) enqueue(response, true);
    else restorePending();
  }).catch(() => restorePending(true));
  return {
    dispose() { disposed = true; subscription.remove(); },
    async settleStartup() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settled = (async () => {
        await startup;
        // 처리 도중 새 탭이 들어오면 그 탭의 보존/취소까지 기다려 reload 경계를 지킨다.
        let current;
        do { current = queue; await current; } while (current !== queue);
        return outcome;
      })();
      const deadline = new Promise<ResumeStartupOutcome>((resolve) => {
        timer = setTimeout(() => resolve(outcome === 'none' ? 'unavailable' : outcome), deps.startupDeadlineMs ?? 1500);
      });
      try { return await Promise.race([settled, deadline]); }
      finally { if (timer !== undefined) clearTimeout(timer); }
    },
  };
}
