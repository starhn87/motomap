const sharePage = document.querySelector('[data-share-page]');

if (sharePage instanceof HTMLElement) {
  const appUrl = sharePage.dataset.appUrl;
  const storeUrl = sharePage.dataset.storeUrl;
  const openAppLink = sharePage.querySelector('[data-open-app]');
  const status = sharePage.querySelector('[data-share-status]');
  let storeFallback;

  const cancelStoreFallback = () => {
    if (storeFallback !== undefined) {
      window.clearTimeout(storeFallback);
      storeFallback = undefined;
    }
  };

  const openApp = () => {
    if (!appUrl || !storeUrl) return;

    cancelStoreFallback();
    if (status) status.textContent = '모토맵을 여는 중이에요…';

    storeFallback = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.location.replace(storeUrl);
      }
    }, 1400);

    window.location.href = appUrl;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cancelStoreFallback();
  });
  window.addEventListener('pagehide', cancelStoreFallback);
  openAppLink?.addEventListener('click', (event) => {
    event.preventDefault();
    openApp();
  });

  openApp();
}
