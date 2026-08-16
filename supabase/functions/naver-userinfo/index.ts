interface NaverProfileResponse {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
  };
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('authorization');
  if (!authorization?.match(/^Bearer\s+\S+$/i)) {
    return json({ error: 'invalid_token' }, 401);
  }

  try {
    const response = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return json(
        { error: response.status === 401 || response.status === 403 ? 'invalid_token' : 'upstream_error' },
        response.status === 401 || response.status === 403 ? 401 : 502,
      );
    }

    const body = await response.json() as NaverProfileResponse;
    const profile = body.response;
    if (body.resultcode !== '00' || !profile?.id) {
      return json({ error: 'invalid_userinfo' }, 502);
    }

    return json({
      sub: profile.id,
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.name || profile.nickname ? { name: profile.name ?? profile.nickname } : {}),
      ...(profile.profile_image ? { picture: profile.profile_image } : {}),
    }, 200);
  } catch {
    return json({ error: 'upstream_unavailable' }, 502);
  }
});
