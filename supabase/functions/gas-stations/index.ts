// 오피넷(Opinet) 유가 프록시 — 주변 주유소(aroundAll)·상세(detailById)를 WGS84로 변환해 반환.
//
// 앱이 오피넷 키를 갖지 않도록 서버에서 호출하고, 인메모리 캐시(3분)로 호출량을 줄인다.
// 요청은 POST JSON:
//   주변: { lat, lng, radius?, prod? }   (WGS84, radius 최대 5000m, prod 기본 B027 보통휘발유)
//   상세: { id }                          (aroundAll이 준 UNI_ID)
//
// 오피넷 실측 주의점 (2026-07 실키 검증):
//   - 인증 파라미터는 문서의 certkey= 가 아니라 code= 만 동작한다
//   - 좌표는 요청·응답 모두 KATEC (아래 proj4 정의는 공식 샘플 좌표와 0.2m 오차로 검증됨)
//   - 브랜드 코드 필드가 aroundAll 은 POLL_DIV_CD, detailById 는 POLL_DIV_CO 로 서로 다르다
//   - 잘못된 키여도 HTTP 200 + 빈 배열이라, 빈 결과가 인증 실패일 수 있다
//   - SELF_YN 필드가 없어 셀프 여부는 상호명 휴리스틱으로 판별한다
//
// secrets: OPINET_API_KEY

import proj4 from 'npm:proj4@2.15.0';

const KATEC =
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

const OPINET = 'https://www.opinet.co.kr/api';
const OPINET_KEY = Deno.env.get('OPINET_API_KEY') ?? '';

const BRANDS: Record<string, string> = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: 'HD현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '자영알뜰',
  RTX: 'ex알뜰',
  NHO: 'NH알뜰',
  ETC: '자가상표',
  SKG: 'SK가스',
  E1G: 'E1',
};

const FUEL_CODES = new Set(['B027', 'B034', 'D047', 'C004', 'K015']);

// 인스턴스 수명 동안의 단순 캐시 — 좌표를 ~1km 격자로 뭉쳐 키를 만든다
const cache = new Map<string, { exp: number; body: string }>();
const TTL_MS = 3 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cached(key: string): string | null {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.body;
  cache.delete(key);
  return null;
}

function put(key: string, body: string) {
  if (cache.size > 500) cache.clear();
  cache.set(key, { exp: Date.now() + TTL_MS, body });
}

function isSelf(name: string): boolean {
  return /셀프|self/i.test(name);
}

async function opinet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ code: OPINET_KEY, out: 'json', ...params });
  const res = await fetch(`${OPINET}/${path}?${qs}`);
  if (!res.ok) throw new Error(`오피넷 응답 ${res.status}`);
  return (await res.json())?.RESULT?.OIL;
}

async function handleAround(lat: number, lng: number, radius: number, prod: string) {
  const key = `a:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${prod}`;
  const hit = cached(key);
  if (hit) return new Response(hit, { headers: { 'Content-Type': 'application/json' } });

  const [x, y] = proj4('EPSG:4326', KATEC, [lng, lat]);
  const oil = await opinet('aroundAll.do', {
    x: x.toFixed(1),
    y: y.toFixed(1),
    radius: String(radius),
    prodcd: prod,
    sort: '1', // 가격순 — 첫 항목이 최저가
  });

  const rows: Record<string, unknown>[] = Array.isArray(oil) ? oil : oil ? [oil] : [];
  const stations = rows.map((o) => {
    const [slng, slat] = proj4(KATEC, 'EPSG:4326', [Number(o.GIS_X_COOR), Number(o.GIS_Y_COOR)]);
    const name = String(o.OS_NM ?? '');
    return {
      id: String(o.UNI_ID),
      name,
      brand: BRANDS[String(o.POLL_DIV_CD ?? o.POLL_DIV_CO ?? '')] ?? '',
      price: Number(o.PRICE),
      distance: Math.round(Number(o.DISTANCE)),
      latitude: slat,
      longitude: slng,
      isSelf: isSelf(name),
    };
  });

  const body = JSON.stringify({ stations });
  put(key, body);
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}

async function handleDetail(id: string) {
  const key = `d:${id}`;
  const hit = cached(key);
  if (hit) return new Response(hit, { headers: { 'Content-Type': 'application/json' } });

  const oil = await opinet('detailById.do', { id });
  const d: Record<string, unknown> | undefined = Array.isArray(oil) ? oil[0] : oil;
  if (!d) return json({ error: '주유소를 찾을 수 없습니다.' }, 404);

  const rawPrices = Array.isArray(d.OIL_PRICE) ? d.OIL_PRICE : d.OIL_PRICE ? [d.OIL_PRICE] : [];
  const name = String(d.OS_NM ?? '');
  const body = JSON.stringify({
    id: String(d.UNI_ID),
    name,
    brand: BRANDS[String(d.POLL_DIV_CO ?? d.POLL_DIV_CD ?? '')] ?? '',
    address: String(d.NEW_ADR || d.VAN_ADR || ''),
    tel: String(d.TEL ?? ''),
    isSelf: isSelf(name),
    carWash: d.CAR_WASH_YN === 'Y',
    convenience: d.CVS_YN === 'Y',
    repair: d.MAINT_YN === 'Y',
    prices: (rawPrices as Record<string, unknown>[])
      .filter((p) => FUEL_CODES.has(String(p.PRODCD)))
      .map((p) => ({
        prod: String(p.PRODCD),
        price: Number(p.PRICE),
        tradeAt: `${p.TRADE_DT ?? ''} ${p.TRADE_TM ?? ''}`.trim(),
      })),
  });
  put(key, body);
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (!OPINET_KEY) return json({ error: 'OPINET_API_KEY 미설정' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON body 필요' }, 400);
  }

  try {
    if (typeof body.id === 'string' && body.id) return await handleDetail(body.id);

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: 'lat/lng 필요' }, 400);
    }
    const radius = Math.min(Math.max(Number(body.radius) || 5000, 500), 5000);
    const prod = FUEL_CODES.has(String(body.prod)) ? String(body.prod) : 'B027';
    return await handleAround(lat, lng, radius, prod);
  } catch (e) {
    return json({ error: String(e).slice(0, 200) }, 502);
  }
});
