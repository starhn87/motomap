// 중단·업데이트 화면에서도 인증·지도 없이 사용할 수 있는 알림 연결이다.
export const RESUME_NOTIFICATION_KEY = 'service-resume-notification:last-opened';

export function isServiceResumeNotification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const payload = data as Record<string, unknown>;
  return payload.type === 'notice' && payload.kind === 'service_resumed' &&
    payload.action === 'update_app';
}

type ResumeResponse = {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: unknown } } };
};

type ResumeDependencies = {
  defaultActionIdentifier: string;
  getLastResponse: () => Promise<ResumeResponse | null>;
  listen: (listener: (response: ResumeResponse) => void) => { remove: () => void };
  getHandledId: () => Promise<string | null>;
  setHandledId: (id: string) => Promise<void>;
  openStore: () => Promise<unknown>;
};

/** 알림 수신 자체가 아닌 명시적인 탭만 처리하고, 지난 탭을 재실행하지 않는다. */
export function setupServiceResumeNotification(deps: ResumeDependencies): () => void {
  let disposed = false;
  let liveResponseSeen = false;
  let handledId: string | null = null;
  let queue = Promise.resolve();
  const enqueue = (response: ResumeResponse | null, initial = false) => {
    queue = queue.then(async () => {
      if (disposed || (initial && liveResponseSeen) || !response || response.actionIdentifier !== deps.defaultActionIdentifier) return;
      const request = response.notification.request;
      if (!request.identifier || !isServiceResumeNotification(request.content.data)) return;
      if (handledId === request.identifier) return;
      let previousId: string | null = null;
      try { previousId = await deps.getHandledId(); } catch { /* 저장 실패는 스토어 열기를 막지 않는다. */ }
      if (disposed || (initial && liveResponseSeen) || previousId === request.identifier) return;
      // 페이로드의 URL은 사용하지 않는다. 연결 대상은 앱의 고정 App Store URL뿐이다.
      await deps.openStore();
      handledId = request.identifier;
      try { await deps.setHandledId(request.identifier); } catch { /* 현재 실행의 중복 방지는 유지한다. */ }
    }).catch(() => {
      // 연결 실패 시 업데이트 화면의 App Store 버튼으로 다시 시도할 수 있다.
    });
  };
  const subscription = deps.listen((response) => {
    // 늦게 돌아온 콜드 응답이 더 최근의 사용자 탭을 덮어쓰지 않는다.
    liveResponseSeen = true;
    enqueue(response);
  });
  void deps.getLastResponse().then((response) => enqueue(response, true)).catch(() => {});
  return () => { disposed = true; subscription.remove(); };
}
