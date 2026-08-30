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

function maintenancePage() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    <meta name="description" content="모토맵은 필수적인 운영 절차와 서비스 정비를 거쳐 2026년 9월 중 운영을 재개할 예정입니다." />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:title" content="운영 일시 중단: 모토맵" />
    <meta property="og:description" content="모토맵은 2026년 9월 중 운영을 재개할 예정입니다." />
    <meta property="og:image" content="https://motomap.kr/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="검은 배경 위 흰색 바이크 아이콘" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="운영 일시 중단: 모토맵" />
    <meta name="twitter:description" content="모토맵은 2026년 9월 중 운영을 재개할 예정입니다." />
    <meta name="twitter:image" content="https://motomap.kr/og.png" />
    <link rel="canonical" href="https://motomap.kr/" />
    <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <title>운영 일시 중단: 모토맵</title>
  </head>
  <body class="maintenance-page">
    <main class="maintenance-card">
      <img class="maintenance-icon" src="/icon.png" alt="모토맵" width="72" height="72" />
      <p class="eyebrow">운영 일시 중단</p>
      <h1>모토맵을 잠시 멈춥니다</h1>
      <p class="maintenance-description">
        필수적인 운영 절차와 서비스 정비를 진행하고 있어요.
      </p>
      <p class="maintenance-resume-status">2026년 9월 중 운영 재개 예정</p>
      <p class="maintenance-notice">현재 위치·지도·길안내 기능은 제공하지 않습니다.</p>
      <a class="maintenance-contact" href="mailto:starhn87@gmail.com?subject=%5B%EB%AA%A8%ED%86%A0%EB%A7%B5%5D%20%EA%B3%84%EC%A0%95%C2%B7%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EB%AC%B8%EC%9D%98">계정·데이터 문의</a>
      <nav class="maintenance-links" aria-label="법률 문서">
        <a href="/terms">이용약관</a>
        <a href="/privacy">개인정보 처리방침</a>
        <a href="/location-terms">위치기반 서비스 이용약관</a>
      </nav>
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

    // Worker가 먼저 실행되므로 정적 자산은 명시적으로 assets binding에 넘긴다.
    // 법률·운영 중단 페이지의 CSS와 아이콘까지 503 HTML로 바뀌는 것을 막는다.
    if (/\.[a-z0-9]+$/i.test(url.pathname)) {
      return env.ASSETS.fetch(request);
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

    return new Response(maintenancePage(), {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '86400',
        ...securityHeaders,
      },
    });
  },
};
