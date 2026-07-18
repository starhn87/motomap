// 에어코리아(한국환경공단) 대기질 프록시 — 좌표(TM) 기준 최근접 측정소의
// 미세먼지(PM10)·초미세먼지(PM2.5) 실시간 값과 등급을 반환한다.
// 키 보호를 위해 앱이 직접 호출하지 않고 이 함수를 거친다.
//
// GET ?tmX=&tmY= 또는 POST {tmX, tmY}  →  { station, pm10, pm25, pm10Grade, pm25Grade, dataTime }
//   등급: 1 좋음, 2 보통, 3 나쁨, 4 매우나쁨 (에어코리아 규격, 결측이면 null)
//
// TM 좌표 변환은 앱이 카카오 transcoord 로 수행해서 넘긴다 (카카오 키는 앱에 있음).
// 측정소 데이터는 시간 단위 갱신이라 30분 메모리 캐시.
// 필요한 secrets: DATA_GO_KR_KEY (공공데이터포털 인증키 — 에어코리아 2개 서비스 활용신청 필요)
// 배포: JWT 검증 ON (앱이 anon 키로 호출 — weather-kr 과 동일)

const KEY = Deno.env.get('DATA_GO_KR_KEY');

const cache = new Map<string, { at: number; body: string }>();
const TTL = 30 * 60 * 1000;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let tmXRaw = url.searchParams.get('tmX');
  let tmYRaw = url.searchParams.get('tmY');
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    tmXRaw ??= body.tmX;
    tmYRaw ??= body.tmY;
  }
  const tmX = Number(tmXRaw);
  const tmY = Number(tmYRaw);
  if (!Number.isFinite(tmX) || !Number.isFinite(tmY)) {
    return Response.json({ error: 'tmX, tmY 가 필요합니다' }, { status: 400 });
  }
  if (!KEY) return Response.json({ error: 'server key missing' }, { status: 500 });

  // ~1km 격자로 캐시 공유 (측정소는 수 km 간격이라 충분)
  const cacheKey = `${Math.round(tmX / 1000)},${Math.round(tmY / 1000)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) {
    return new Response(hit.body, {
      headers: { 'Content-Type': 'application/json', 'x-cache': 'HIT' },
    });
  }

  // 1) 최근접 측정소
  const nearApi =
    `http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList` +
    `?serviceKey=${KEY}&returnType=json&tmX=${tmX}&tmY=${tmY}`;
  const nearRes = await fetch(nearApi);
  if (!nearRes.ok) return Response.json({ error: `upstream ${nearRes.status}` }, { status: 502 });
  const nearData = await nearRes.json().catch(() => null);
  const station: string | undefined = nearData?.response?.body?.items?.[0]?.stationName;
  if (!station) {
    return Response.json(
      { error: nearData?.response?.header?.resultMsg ?? 'no station' },
      { status: 502 },
    );
  }

  // 2) 해당 측정소 실시간 측정값
  const measureApi =
    `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty` +
    `?serviceKey=${KEY}&returnType=json&stationName=${encodeURIComponent(station)}` +
    `&dataTerm=DAILY&pageNo=1&numOfRows=1&ver=1.3`;
  const res = await fetch(measureApi);
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: 502 });
  const data = await res.json().catch(() => null);
  const item = data?.response?.body?.items?.[0];
  if (!item) {
    return Response.json(
      { error: data?.response?.header?.resultMsg ?? 'no data' },
      { status: 502 },
    );
  }

  // 통신 장애 시 값이 "-" 로 온다 — 숫자화 실패는 null
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const body = JSON.stringify({
    station,
    pm10: num(item.pm10Value),
    pm25: num(item.pm25Value),
    pm10Grade: num(item.pm10Grade),
    pm25Grade: num(item.pm25Grade),
    dataTime: item.dataTime ?? null,
  });
  cache.set(cacheKey, { at: Date.now(), body });
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'x-cache': 'MISS' },
  });
});
