import { LEGAL_DOCS } from '../../constants/legal.ts';

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
    <meta property="og:image" content="https://motomap.kr/icon.png" />
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

    const contentMatch = url.pathname.match(/^\/(place|course)\/([^/]+)\/?$/);
    if (contentMatch) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: APP_STORE_URL,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
