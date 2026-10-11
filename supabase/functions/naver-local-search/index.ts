import { enforceRateLimits } from '../_shared/rateLimit.ts';
import { createNaverLocalHandler } from '../_shared/naverLocalSearch.ts';

// Maps·소셜 로그인과 다른 API HUB 전용 서버 키. 앱 번들에는 포함하지 않는다.
Deno.serve(createNaverLocalHandler({
  clientId: Deno.env.get('NAVER_LOCAL_SEARCH_CLIENT_ID') ?? '',
  clientSecret: Deno.env.get('NAVER_LOCAL_SEARCH_CLIENT_SECRET') ?? '',
  fetch,
  limit: (req) => enforceRateLimits(req, [
    { scope: 'naver-local-burst', limit: 20, windowSeconds: 300 },
    { scope: 'naver-local-daily', limit: 100, windowSeconds: 86_400 },
  ]),
}));
