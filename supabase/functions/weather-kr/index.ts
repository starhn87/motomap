// 기상청 예보 프록시 — 시간대별 강수확률(POP)을 네이버·아이폰 날씨와 같은
// 원천(기상청 동네예보)으로 제공한다. Open-Meteo(ECMWF 앙상블)의 확률이 한국에서
// 체감보다 높게 나오는 문제의 해법.
//
// 단기예보(3시간 주기)에 초단기예보(매시간 발표, 향후 6시간)를 병합한다 — 네이버가
// 가까운 시간대를 매시간 갱신하는 것과 같은 방식. 기온(T1H)·강수형태(PTY)·하늘(SKY)은
// 초단기가 덮어쓰고, 강수확률(POP)은 초단기에 없어 단기예보 값을 유지한다.
//
// GET ?lat=&lng= 또는 POST {lat, lng}  →  { base: "202607171700", hours: [{ date, time, tmp, pop, pty, sky, wsd, reh }] }
//   pty(강수형태): 0 없음, 1 비, 2 비/눈, 3 눈, 4 소나기
//   sky(하늘): 1 맑음, 3 구름많음, 4 흐림
//
// 같은 격자·발표분은 30분 메모리 캐시 (발표 주기가 3시간이라 충분).
// 필요한 secrets: DATA_GO_KR_KEY (공공데이터포털 인증키)
// 배포: JWT 검증 ON (앱이 anon 키로 호출 — gas-stations 와 동일)

const KEY = Deno.env.get('DATA_GO_KR_KEY');

// 위경도 → 기상청 격자 (Lambert Conformal Conic, 기상청 공식 상수)
function toGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경 km
  const GRID = 5.0; // 격자 간격 km
  const SLAT1 = 30.0, SLAT2 = 60.0; // 표준 위도
  const OLON = 126.0, OLAT = 38.0; // 기준점
  const XO = 43, YO = 136; // 기준점 격자

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// 최근 발표분(02,05,...,23시 + 제공 여유 15분) 계산 — KST 기준
function baseDateTime(): { date: string; time: string } {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const hours = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  let base = hours.find((x) => h > x || (h === x && m >= 15));
  let day = kst;
  if (base === undefined) {
    base = 23;
    day = new Date(kst.getTime() - 86400000);
  }
  return {
    date: day.toISOString().slice(0, 10).replaceAll('-', ''),
    time: String(base).padStart(2, '0') + '00',
  };
}

// 최근 초단기예보 발표분 — 매시 30분 발표, 제공 여유 45분 (KST 기준)
function ultraBaseDateTime(): { date: string; time: string } {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  let h = kst.getUTCHours();
  let day = kst;
  if (kst.getUTCMinutes() < 45) {
    if (h === 0) {
      day = new Date(kst.getTime() - 86400000);
      h = 24;
    }
    h -= 1;
  }
  return {
    date: day.toISOString().slice(0, 10).replaceAll('-', ''),
    time: String(h).padStart(2, '0') + '30',
  };
}

interface Hour {
  date: string;
  time: string;
  tmp: number | null;
  pop: number;
  pty: number;
  sky: number;
  wsd: number | null;
  reh: number | null;
}

const cache = new Map<string, { at: number; body: string }>();
const TTL = 30 * 60 * 1000;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let latRaw = url.searchParams.get('lat');
  let lngRaw = url.searchParams.get('lng');
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    latRaw ??= body.lat;
    lngRaw ??= body.lng;
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat, lng 가 필요합니다' }, { status: 400 });
  }
  if (!KEY) return Response.json({ error: 'server key missing' }, { status: 500 });

  const { nx, ny } = toGrid(lat, lng);
  const base = baseDateTime();
  const ultra = ultraBaseDateTime();
  const cacheKey = `${nx},${ny},${base.date}${base.time},${ultra.date}${ultra.time}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) {
    return new Response(hit.body, {
      headers: { 'Content-Type': 'application/json', 'x-cache': 'HIT' },
    });
  }

  const common = `?serviceKey=${KEY}&pageNo=1&dataType=JSON&nx=${nx}&ny=${ny}`;
  const api =
    `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `${common}&numOfRows=400&base_date=${base.date}&base_time=${base.time}`;
  const ultraApi =
    `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst` +
    `${common}&numOfRows=100&base_date=${ultra.date}&base_time=${ultra.time}`;
  const [res, ultraRes] = await Promise.all([
    fetch(api),
    fetch(ultraApi).catch(() => null),
  ]);
  if (!res.ok) return Response.json({ error: `upstream ${res.status}` }, { status: 502 });
  const data = await res.json().catch(() => null);
  const items: { category: string; fcstDate: string; fcstTime: string; fcstValue: string }[] =
    data?.response?.body?.items?.item ?? [];
  if (!items.length) {
    return Response.json(
      { error: data?.response?.header?.resultMsg ?? 'no data' },
      { status: 502 },
    );
  }
  // 초단기는 실패해도 단기만으로 응답한다
  const ultraData = ultraRes?.ok ? await ultraRes.json().catch(() => null) : null;
  const ultraItems: { category: string; fcstDate: string; fcstTime: string; fcstValue: string }[] =
    ultraData?.response?.body?.items?.item ?? [];

  // (날짜, 시각)별로 카테고리를 모아 시간 행으로 변환 — 앞 24시간만
  const byTime = new Map<string, Partial<Record<string, string>>>();
  for (const it of items) {
    const k = `${it.fcstDate}${it.fcstTime}`;
    const row = byTime.get(k) ?? {};
    row[it.category] = it.fcstValue;
    byTime.set(k, row);
  }
  // 초단기 병합 — 카테고리 이름이 다르다 (T1H→TMP 상당, PTY·SKY는 동일 의미)
  const ULTRA_MAP: Record<string, string> = { T1H: 'TMP', PTY: 'PTY', SKY: 'SKY', WSD: 'WSD', REH: 'REH' };
  // 초단기 전용 강수형태 코드를 단기 체계(0~4)로 정규화 — 5 빗방울→비, 6 빗방울눈날림→비/눈, 7 눈날림→눈
  const ULTRA_PTY: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  const ultraCovered = new Set<string>();
  for (const it of ultraItems) {
    const cat = ULTRA_MAP[it.category];
    if (!cat) continue;
    const k = `${it.fcstDate}${it.fcstTime}`;
    const row = byTime.get(k);
    if (!row) continue; // 단기예보 범위 밖 시간은 무시
    row[cat] = cat === 'PTY' ? (ULTRA_PTY[it.fcstValue] ?? it.fcstValue) : it.fcstValue;
    ultraCovered.add(k);
  }
  // 발표 후 시간이 지나면 앞 행들이 과거가 된다 — 현재 시간대(정시) 이전은 버린다
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const nowKey =
    kstNow.toISOString().slice(0, 10).replaceAll('-', '') +
    String(kstNow.getUTCHours()).padStart(2, '0') +
    '00';
  const hours: Hour[] = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([k]) => k >= nowKey)
    .slice(0, 24)
    .map(([k, r]) => {
      const pty = Number(r.PTY ?? 0);
      let pop = Number(r.POP ?? 0);
      // 초단기(레이더 실황 기반)가 "강수 없음"으로 갱신한 시간대에 3시간 전
      // 단기예보의 확률을 남겨두면 "갬인데 60%"라는 모순으로 보인다 — 네이버처럼
      // 확률도 0으로 정합화한다.
      if (ultraCovered.has(k) && pty === 0) pop = 0;
      return {
        date: k.slice(0, 8),
        time: k.slice(8, 12),
        tmp: r.TMP != null ? Number(r.TMP) : null,
        pop,
        pty,
        sky: Number(r.SKY ?? 1),
        wsd: r.WSD != null ? Number(r.WSD) : null,
        reh: r.REH != null ? Number(r.REH) : null,
      };
    });

  const body = JSON.stringify({ base: `${base.date}${base.time}`, nx, ny, hours });
  cache.set(cacheKey, { at: Date.now(), body });
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'x-cache': 'MISS' },
  });
});
