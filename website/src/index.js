import { LEGAL_DOCS } from '../../constants/legal.ts';

const APP_IDENTIFIER = 'QD4486Q3L8.com.ridemap.app';

const association = {
  applinks: {
    details: [
      {
        appIDs: [APP_IDENTIFIER],
        components: [{ '/': '/place/*' }, { '/': '/course/*' }, { '/': '/riding/*' }],
      },
    ],
  },
};

const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6773636183';
const APP_STORE_ID = '6773636183';
const LEGAL_PATHS = {
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/location-terms': 'location',
  '/legal/terms': 'terms',
  '/legal/privacy': 'privacy',
  '/legal/location': 'location',
};
const LEGAL_CANONICAL_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
  location: '/location-terms',
};
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self'; style-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function legalContent(content) {
  let followsBlankLine = true;

  return content
    .split('\n')
    .map((line) => {
      const text = line.trim();
      if (!text) {
        followsBlankLine = true;
        return '<div class="legal-spacer" aria-hidden="true"></div>';
      }

      const isSectionTitle =
        /^(제\d+조(?:\s|\()|부칙$)/.test(text) ||
        (followsBlankLine && /^\d+\.\s/.test(text));
      followsBlankLine = false;

      if (isSectionTitle) {
        return `<h2>${escapeHtml(text)}</h2>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

function legalPage(type) {
  const document = LEGAL_DOCS[type];
  const canonicalPath = LEGAL_CANONICAL_PATHS[type];
  const title = escapeHtml(document.title);

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    <meta name="description" content="모토맵 ${title}" />
    <meta property="og:title" content="${title}: 모토맵" />
    <meta property="og:description" content="모토맵 ${title}" />
    <meta property="og:image" content="https://motomap.kr/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="검은 배경 위 흰색 바이크 아이콘" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}: 모토맵" />
    <meta name="twitter:description" content="모토맵 ${title}" />
    <meta name="twitter:image" content="https://motomap.kr/og.png" />
    <link rel="canonical" href="https://motomap.kr${canonicalPath}" />
    <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <title>${title}: 모토맵</title>
  </head>
  <body class="legal-page">
    <header class="legal-header">
      <a class="brand" href="/" aria-label="모토맵 홈">
        <img src="/icon.png" alt="" width="40" height="40" />
        <span>모토맵</span>
      </a>
      <a class="legal-home-link" href="/">소개로 돌아가기</a>
    </header>
    <main class="legal-document">
      <p class="eyebrow">LEGAL</p>
      <h1>${title}</h1>
      <div class="legal-content">${legalContent(document.content)}</div>
      <nav class="legal-document-nav" aria-label="법률 문서">
        <a href="/terms">서비스 이용약관</a>
        <a href="/privacy">개인정보 처리방침</a>
        <a href="/location-terms">위치기반 서비스 이용약관</a>
      </nav>
    </main>
  </body>
</html>`;
}

function sharedContentPage(kind, encodedId) {
  const label = kind === 'riding' ? '라이딩 추천' : kind === 'course' ? '코스' : '장소';
  const description =
    kind === 'riding'
      ? '모토맵에서 추천 장소와 달리기 좋은 길을 확인하세요.'
      : `모토맵에서 ${label} 정보와 라이더 기록을 확인하세요.`;
  let routeId;
  try {
    routeId = encodeURIComponent(decodeURIComponent(encodedId));
  } catch {
    routeId = encodeURIComponent(encodedId);
  }
  const canonicalUrl = `https://motomap.kr/${kind}/${routeId}`;
  const appUrl = `ridemap://${kind}/${routeId}`;
  const title = `공유된 ${label}를 여는 중이에요`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    <meta name="description" content="모토맵에서 공유된 ${label}를 확인하세요." />
    <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${canonicalUrl}" />
    <meta property="og:title" content="${title}: 모토맵" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="https://motomap.kr/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="검은 배경 위 흰색 바이크 아이콘" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}: 모토맵" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://motomap.kr/og.png" />
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <title>${title}: 모토맵</title>
    <script src="/share.js" defer></script>
  </head>
  <body class="shared-page">
    <main
      class="shared-card"
      data-share-page
      data-app-url="${escapeHtml(appUrl)}"
      data-store-url="${APP_STORE_URL}">
      <a class="brand shared-brand" href="/" aria-label="모토맵 홈">
        <img src="/icon.png" alt="" width="48" height="48" />
        <span>모토맵</span>
      </a>
      <div class="shared-app-icon" aria-hidden="true">
        <img src="/icon.png" alt="" width="84" height="84" />
      </div>
      <p class="eyebrow">공유된 ${label}</p>
      <h1>${title}</h1>
      <p data-share-status>앱이 설치되어 있으면 곧바로 ${label} 화면으로 이동해요.</p>
      <div class="shared-actions">
        <a class="primary-button" href="${escapeHtml(appUrl)}" data-open-app>모토맵에서 열기</a>
        <a class="secondary-button" href="${APP_STORE_URL}">App Store에서 받기</a>
      </div>
      <a class="home-link" href="/">모토맵 소개 보기</a>
    </main>
  </body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestHostname = request.headers.get('host')?.split(':')[0] ?? url.hostname;

    if (requestHostname === 'www.motomap.kr') {
      url.hostname = 'motomap.kr';
      url.protocol = 'https:';
      return Response.redirect(url, 308);
    }

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

    const normalizedPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
    const legalType = LEGAL_PATHS[normalizedPath];
    if (legalType) {
      return new Response(legalPage(legalType), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...securityHeaders,
        },
      });
    }

    const contentMatch = url.pathname.match(/^\/(place|course|riding)\/([^/]+)\/?$/);
    if (contentMatch) {
      return new Response(sharedContentPage(contentMatch[1], contentMatch[2]), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          ...securityHeaders,
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
