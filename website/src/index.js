import { LEGAL_DOCS, LEGAL_RELAUNCH_DOCS, LEGAL_RELAUNCH_READY, LEGAL_DRAFT_NOTICE,
  LEGAL_CHANGE_SUMMARY } from '../../constants/legal.ts';
import { serviceStatus } from './serviceStatus.js';

const APP_IDENTIFIER = 'QD4486Q3L8.com.ridemap.app';
const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6773636183';
const APP_STORE_ID = '6773636183';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
const LEGAL_UPCOMING_PATHS = {
  '/terms/upcoming': 'terms',
  '/privacy/upcoming': 'privacy',
  '/location-terms/upcoming': 'location',
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

function legalPage(type, preview = false) {
  const document = (preview ? LEGAL_RELAUNCH_DOCS : LEGAL_DOCS)[type];
  const canonicalPath = LEGAL_CANONICAL_PATHS[type] + (preview ? '/upcoming' : '');
  const title = escapeHtml(document.title + (preview ? ' (개정안)' : ''));

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    ${preview ? '<meta name="robots" content="noindex, nofollow" />' : ''}
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
      ${preview ? `<aside aria-label="개정안 안내"><p>${escapeHtml(LEGAL_DRAFT_NOTICE)}</p>
        <h2>주요 변경 사항</h2><ul>${LEGAL_CHANGE_SUMMARY.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>` : ''}
      <div class="legal-content">${legalContent(document.content)}</div>
      ${!LEGAL_RELAUNCH_READY ? `<p><a href="${preview ? LEGAL_CANONICAL_PATHS[type] : canonicalPath + '/upcoming'}">${preview ? '현재 적용 중인 문서 보기' : '운영 재개 개정안과 변경 사항 보기'}</a></p>` : ''}
      <nav class="legal-document-nav" aria-label="법률 문서">
        <a href="/terms">서비스 이용약관</a>
        <a href="/privacy">개인정보 처리방침</a>
        <a href="/location-terms">위치기반 서비스 이용약관</a>
      </nav>
    </main>
  </body>
</html>`;
}

async function ridingGuideMetadata(id, env) {
  if (!UUID_PATTERN.test(id) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  try {
    const endpoint = new URL('/rest/v1/riding_guides', env.SUPABASE_URL);
    endpoint.searchParams.set('id', `eq.${id}`);
    endpoint.searchParams.set('published_at', 'not.is.null');
    endpoint.searchParams.set('deleted_at', 'is.null');
    endpoint.searchParams.set('select', 'title,summary');
    endpoint.searchParams.set('limit', '1');

    const response = await fetch(endpoint, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) {
      console.warn(JSON.stringify({
        event: 'shared_riding_guide_metadata_failed',
        status: response.status,
      }));
      return null;
    }

    const rows = await response.json();
    const guide = Array.isArray(rows) ? rows[0] : null;
    if (!guide || typeof guide.title !== 'string' || !guide.title.trim()) return null;

    return {
      title: guide.title.trim().slice(0, 120),
      description:
        typeof guide.summary === 'string' && guide.summary.trim()
          ? guide.summary.trim().slice(0, 240)
          : null,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'shared_riding_guide_metadata_failed',
      reason: error instanceof Error ? error.name : 'unknown',
    }));
    return null;
  }
}

async function sharedContentPage(kind, encodedId, env) {
  const label = kind === 'riding' ? '라이딩 추천' : kind === 'course' ? '코스' : '장소';
  const fallbackDescription =
    kind === 'riding'
      ? '모토맵에서 추천 장소와 달리기 좋은 길을 확인하세요.'
      : `모토맵에서 ${label} 정보와 라이더 기록을 확인하세요.`;
  let decodedId;
  try {
    decodedId = decodeURIComponent(encodedId);
  } catch {
    decodedId = encodedId;
  }
  const routeId = encodeURIComponent(decodedId);
  const metadata = kind === 'riding' ? await ridingGuideMetadata(decodedId, env) : null;
  const canonicalUrl = `https://motomap.kr/${kind}/${routeId}`;
  const appUrl = `ridemap://${kind}/${routeId}`;
  const title = escapeHtml(metadata?.title ?? label);
  const description = escapeHtml(metadata?.description ?? fallbackDescription);
  const heading = metadata?.title ? title : `${label}를 여는 중이에요`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    <meta name="description" content="${description}" />
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
      <h1>${heading}</h1>
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

function maintenancePage() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0c0e" />
    <meta name="description" content="준비가 늦어져 죄송합니다. 모토맵은 2026년 10월 중 운영을 재개하겠습니다." />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:title" content="운영 일시 중단: 모토맵" />
    <meta property="og:description" content="준비가 늦어져 죄송합니다. 모토맵은 2026년 10월 중 운영을 재개하겠습니다." />
    <meta property="og:image" content="https://motomap.kr/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="검은 배경 위 흰색 바이크 아이콘" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="운영 일시 중단: 모토맵" />
    <meta name="twitter:description" content="준비가 늦어져 죄송합니다. 모토맵은 2026년 10월 중 운영을 재개하겠습니다." />
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
        준비가 늦어져 죄송합니다.<br />필수적인 운영 절차와 서비스 정비를 마무리하고 있어요.
      </p>
      <p class="maintenance-resume-status">2026년 10월 중 운영을 재개하겠습니다</p>
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

function maintenanceResponse() {
  return new Response(maintenancePage(), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '86400',
      ...securityHeaders,
    },
  });
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

    if (url.pathname === '/service-status') {
      if (request.method !== 'GET') {
        return new Response(null, {
          status: 405,
          headers: { Allow: 'GET', 'Cache-Control': 'no-store', ...securityHeaders },
        });
      }

      return Response.json(serviceStatus, {
        headers: { 'Cache-Control': 'no-store', ...securityHeaders },
      });
    }

    // Worker가 먼저 실행되므로 정적 자산은 명시적으로 assets binding에 넘긴다.
    // 법률·운영 중단 페이지의 CSS와 아이콘까지 503 HTML로 바뀌는 것을 막는다.
    if (/\.[a-z0-9]+$/i.test(url.pathname) && url.pathname !== '/index.html') {
      const asset = await env.ASSETS.fetch(request);
      // SPA 설정은 없는 .js 경로에도 index HTML을 줄 수 있다. 재중단 시 우회하지 않는다.
      if (serviceStatus.status !== 'active' && /text\/html/i.test(asset.headers.get('Content-Type') ?? '')) {
        await asset.body?.cancel();
        return maintenanceResponse();
      }
      return asset;
    }

    const normalizedPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
    const previewType = Object.hasOwn(LEGAL_UPCOMING_PATHS, normalizedPath)
      ? LEGAL_UPCOMING_PATHS[normalizedPath] : undefined;
    if (previewType) {
      if (LEGAL_RELAUNCH_READY) {
        return Response.redirect(`https://motomap.kr${LEGAL_CANONICAL_PATHS[previewType]}`, 308);
      }
      return new Response(legalPage(previewType, true), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...securityHeaders },
      });
    }
    const legalType = Object.hasOwn(LEGAL_PATHS, normalizedPath) ? LEGAL_PATHS[normalizedPath] : undefined;
    if (legalType) {
      return new Response(legalPage(legalType), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...securityHeaders,
        },
      });
    }

    if (serviceStatus.status === 'active') {
      const contentMatch = url.pathname.match(/^\/(place|course|riding)\/([^/]+)\/?$/);
      if (contentMatch) {
        return new Response(await sharedContentPage(contentMatch[1], contentMatch[2], env), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
            ...securityHeaders,
          },
        });
      }
      return env.ASSETS.fetch(request);
    }

    return maintenanceResponse();
  },
};
