const APP_IDENTIFIER = 'QD4486Q3L8.com.ridemap.app';

const association = {
  applinks: {
    details: [
      {
        appIDs: [APP_IDENTIFIER],
        components: [{ '/': '/place/*' }, { '/': '/course/*' }],
      },
    ],
  },
};

const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6773636183';
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self'; style-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function sharedContentPage(kind, id) {
  const isCourse = kind === 'course';
  const label = isCourse ? '코스' : '장소';
  const title = isCourse ? '함께 달릴 코스를 확인해보세요' : '라이더가 공유한 장소를 확인해보세요';
  const deepLink = `ridemap://${kind}/${encodeURIComponent(id)}`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0c0d0f" />
    <meta name="description" content="${title}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="모토맵에서 ${label} 정보와 라이더 기록을 확인하세요." />
    <meta property="og:image" content="https://motomap.kr/icon.png" />
    <link rel="icon" href="/icon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <title>${title} — 모토맵</title>
  </head>
  <body class="shared-page">
    <main class="shared-card">
      <a class="brand shared-brand" href="/">
        <img src="/icon.png" alt="" width="48" height="48" />
        <span>모토맵</span>
      </a>
      <p class="eyebrow">공유된 ${label}</p>
      <h1>${title}</h1>
      <p>모토맵 앱을 열면 상세 정보와 리뷰를 바로 볼 수 있어요.</p>
      <div class="shared-actions">
        <a class="primary-button" href="${deepLink}">앱에서 열기</a>
        <a class="secondary-button" href="${APP_STORE_URL}">앱 설치하기</a>
      </div>
      <a class="home-link" href="/">모토맵 소개 보기</a>
    </main>
  </body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === '/.well-known/apple-app-site-association' ||
      url.pathname === '/apple-app-site-association'
    ) {
      return Response.json(association, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          ...securityHeaders,
        },
      });
    }

    const contentMatch = url.pathname.match(/^\/(place|course)\/([^/]+)\/?$/);
    if (contentMatch) {
      return new Response(sharedContentPage(contentMatch[1], contentMatch[2]), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...securityHeaders,
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
