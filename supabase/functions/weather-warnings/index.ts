// 기상특보 프록시 — 기상청 특보 통보문(전국, stnId=108)에서 발효 중인 특보를
// 구조화해 돌려준다. 폭염·호우·강풍·태풍 등은 라이딩 가부 판단에 직결되는데
// 단기예보에는 실리지 않아 별도 API 를 쓴다.
//
// GET → { fetchedAt, warnings: [{ type: "폭염", level: "경보"|"주의보", regions: "서울특별시, ..." }] }
// 전국 공통 payload 라 좌표 파라미터 없이 하나로 캐시(10분). 지역 매칭은 클라이언트가
// 자기 지역명으로 한다.
// 필요한 secrets: DATA_GO_KR_KEY (weather-kr 와 동일 키, 특보 조회서비스 활용신청 필요)

const KEY = Deno.env.get('DATA_GO_KR_KEY');

let cache: { at: number; body: string } | null = null;
const TTL = 10 * 60 * 1000;

// KST YYYYMMDD (offset 일 전)
function kstDate(offsetDays: number): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000);
  return kst.toISOString().slice(0, 10).replaceAll('-', '');
}

// 통보문 특보 현황 텍스트 → 구조화. 형식 예:
//   "o 폭염경보 : 서울특별시, 경기도(수원시, 성남시), ...\r\no 폭염주의보 : 인천광역시(강화군 제외), ..."
function parseWarnings(text: string): { type: string; level: string; regions: string }[] {
  const out: { type: string; level: string; regions: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^o\s*/, '').trim();
    const m = line.match(/^(.+?)(경보|주의보)\s*:\s*(.+)$/);
    if (!m) continue;
    out.push({ type: m[1].trim(), level: m[2], regions: m[3].trim() });
  }
  return out;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';
  if (!KEY) return Response.json({ error: 'server key missing' }, { status: 500 });

  if (!debug && cache && Date.now() - cache.at < TTL) {
    return new Response(cache.body, {
      headers: { 'Content-Type': 'application/json', 'x-cache': 'HIT' },
    });
  }

  // 통보문은 발표가 있을 때만 생기므로 최근 2일 창에서 최신 것을 쓴다
  const api =
    `https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg` +
    `?serviceKey=${KEY}&pageNo=1&numOfRows=50&dataType=JSON&stnId=108` +
    `&fromTmFc=${kstDate(2)}&toTmFc=${kstDate(0)}`;
  const res = await fetch(api);
  if (!res.ok) {
    const detail = debug ? (await res.text().catch(() => '')).slice(0, 500) : undefined;
    return Response.json({ error: `upstream ${res.status}`, detail }, { status: 502 });
  }
  const data = await res.json().catch(() => null);
  if (debug) return Response.json({ raw: data });

  const items: Record<string, string>[] = data?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    // 특보 없음(또는 통보문 없음) — 빈 목록으로 정상 응답
    const body = JSON.stringify({ fetchedAt: new Date().toISOString(), warnings: [] });
    cache = { at: Date.now(), body };
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'x-cache': 'MISS' } });
  }

  // 최신 발표분 (tmFc 내림차순 정렬 후 첫 항목)
  const latest = [...items].sort((a, b) => String(b.tmFc ?? '').localeCompare(String(a.tmFc ?? '')))[0];
  // t6 = 특보 발효 현황 텍스트 (실측으로 확정한 필드)
  const statusText = String(latest.t6 ?? '');
  const warnings = parseWarnings(statusText);

  const body = JSON.stringify({ fetchedAt: new Date().toISOString(), tmFc: latest.tmFc, warnings });
  cache = { at: Date.now(), body };
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'x-cache': 'MISS' },
  });
});
