import { type NaverLocalPlace, parseNaverLocal } from "./naverLocalSearch.ts";

export interface MonitorNaverLookup {
  candidates: NaverLocalPlace[];
  searches: { query: string; received_count: number }[];
}

// 검색 프록시의 사용자별 제한과 섞지 않고 기존 API HUB 서버 키로 소량 조회한다.
// 정상 0건은 성공이며 인증·한도·응답·시간 초과는 모두 불완전한 검사로 구분한다.
export async function lookupMonitorNaver(
  place: { name: string; address: string },
  config: { clientId: string; clientSecret: string; fetch: typeof fetch },
): Promise<MonitorNaverLookup> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Naver cross-check: configuration");
  }
  const region = place.address.trim().split(/\s+/).slice(0, 2).join(" ");
  const queries = [
    ...new Set([`${region} ${place.name}`.trim(), place.address.trim()]),
  ]
    .filter(Boolean);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const searches = await Promise.all(queries.map(async (query) => {
      const url = new URL(
        "https://naverapihub.apigw.ntruss.com/search/v1/local",
      );
      url.searchParams.set("query", query);
      url.searchParams.set("display", "5");
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "random");
      const res = await config.fetch(url, {
        signal: controller.signal,
        headers: {
          "X-NCP-APIGW-API-KEY-ID": config.clientId,
          "X-NCP-APIGW-API-KEY": config.clientSecret,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const kind = res.status === 401 || res.status === 403
          ? "configuration"
          : res.status === 429
          ? "rate_limited"
          : "temporary";
        throw new Error(`Naver cross-check: ${kind}`);
      }
      const candidates = parseNaverLocal(await res.json());
      if (controller.signal.aborted) {
        throw new Error("Naver cross-check: timeout");
      }
      return { query, candidates };
    }));
    const unique = new Map<string, NaverLocalPlace>();
    for (const search of searches) {
      for (const candidate of search.candidates) {
        const key = JSON.stringify([
          candidate.placeName,
          candidate.roadAddress || candidate.address,
          candidate.latitude,
          candidate.longitude,
          candidate.phone,
        ]);
        unique.set(key, candidate);
      }
    }
    // API의 정렬 순서만 바뀌었다고 검토 지문이 달라지지 않도록 고정한다.
    return {
      candidates: [...unique.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => value),
      searches: searches.map(({ query, candidates }) => ({
        query,
        received_count: candidates.length,
      })),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Naver cross-check: timeout");
    }
    if (error instanceof Error && /^Naver cross-check: /.test(error.message)) {
      throw error;
    }
    throw new Error("Naver cross-check: invalid_response_or_network");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
