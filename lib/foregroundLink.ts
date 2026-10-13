type StateSource = {
  currentState: string | null;
  addEventListener: (event: 'change', listener: (state: string) => void) => { remove: () => void };
};

// 콜드 알림 탭의 inactive → active 전환을 기다린다. 임의 타이머로 기기를 추측하지 않는다.
export function createForegroundWaiter(source: StateSource) {
  let disposed = false;
  const cancellations = new Set<() => void>();
  return {
    waitForActive(): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (source.currentState === 'active') return Promise.resolve(true);
      return new Promise((resolve) => {
        let settled = false;
        let subscription: { remove: () => void } | undefined;
        const settle = (active: boolean) => {
          if (settled) return;
          settled = true;
          subscription?.remove();
          cancellations.delete(cancel);
          resolve(active);
        };
        const cancel = () => settle(false);
        cancellations.add(cancel);
        subscription = source.addEventListener('change', (state) => {
          if (state === 'active') settle(true);
        });
        if (settled) subscription.remove();
        else if (source.currentState === 'active') settle(true);
      });
    },
    cancelPending() {
      for (const cancel of cancellations) cancel();
    },
    dispose() {
      disposed = true;
      for (const cancel of cancellations) cancel();
    },
  };
}
