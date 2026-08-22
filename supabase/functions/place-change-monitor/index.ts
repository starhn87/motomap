// 등록 장소의 외부 정보 변화를 찾되 places는 절대 자동 수정하지 않는다.
// 새 후보는 내부 검토 대기열과 Discord 보고로만 남고, 실제 반영은 운영자 승인 뒤
// 별도의 원자적 작업으로 수행한다.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const KAKAO_REST_API_KEY = Deno.env.get("KAKAO_REST_API_KEY");
const MONITOR_SECRET = Deno.env.get("PLACE_CHANGE_MONITOR_SECRET");
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");

type Confidence = "low" | "medium" | "high";
type ChangeType =
  | "not_found"
  | "possible_name_change"
  | "name_changed"
  | "address_changed"
  | "phone_changed"
  | "moved";

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  source_provider: string | null;
  source_place_id: string | null;
  is_curation_protected: boolean;
}

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
}

interface KakaoResponse {
  documents: KakaoDocument[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
}

interface Candidate extends KakaoDocument {
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

interface Detection {
  changeTypes: ChangeType[];
  confidence: Confidence;
  current: Record<string, unknown>;
  observed: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

type ProposedChanges = Partial<{
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  source_provider: "kakao";
  source_place_id: string;
}>;

interface MonitorResult {
  placeId: string;
  placeName: string;
  result: "clean" | "change_detected" | "error";
  reviewId?: string;
  changeTypes?: ChangeType[];
  error?: string;
}

const CHANGE_LABELS: Record<ChangeType, string> = {
  not_found: "검색 결과 없음",
  possible_name_change: "상호 변경 가능성",
  name_changed: "상호 변경",
  address_changed: "주소 변경",
  phone_changed: "전화번호 변경",
  moved: "이전 가능성",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function assertEnvironment(): void {
  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
    ["KAKAO_REST_API_KEY", KAKAO_REST_API_KEY],
    ["PLACE_CHANGE_MONITOR_SECRET", MONITOR_SECRET],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 없습니다: ${missing.join(", ")}`);
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s·._\-–—()\[\]{},'"`]/g, "");
}

function normalizeAddress(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/^대한민국/, "")
    .replace(/특별자치도/g, "도")
    .replace(/특별자치시/g, "시");
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function addressesMatch(a: string, b: string): boolean {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function sameCategory(placeCategory: string, candidate: Candidate): boolean {
  const category = candidate.category_name;
  switch (placeCategory) {
    case "cafe":
      return candidate.category_group_code === "CE7" ||
        category.includes("카페");
    case "restaurant":
      return candidate.category_group_code === "FD6" ||
        category.includes("음식점");
    case "repair_shop":
      return /오토바이|모터사이클|이륜차|수리|정비/.test(category);
    case "gear_shop":
      return /오토바이|모터사이클|이륜차|용품/.test(category);
    case "gas_station":
      return candidate.category_group_code === "OL7" ||
        category.includes("주유소");
    case "rest_stop":
      return category.includes("휴게소");
    case "camping":
      return /캠핑|야영/.test(category);
    default:
      return true;
  }
}

function currentSnapshot(place: PlaceRow): Record<string, unknown> {
  return {
    name: place.name,
    address: place.address,
    phone: place.phone,
    latitude: place.latitude,
    longitude: place.longitude,
    source_provider: place.source_provider,
    source_place_id: place.source_place_id,
  };
}

function observedSnapshot(
  candidate: Candidate | null,
): Record<string, unknown> {
  if (!candidate) return {};
  return {
    name: candidate.place_name,
    address: candidate.road_address_name || candidate.address_name,
    phone: candidate.phone || null,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    source_provider: "kakao",
    source_place_id: candidate.id,
    place_url: candidate.place_url,
    category: candidate.category_name,
  };
}

// 높은 신뢰도로 동일 장소를 찾은 경우에만 사람이 승인할 패치를 만든다. 검색 부재와
// 상호 변경 가능성은 폐업·리브랜딩을 확정할 수 없으므로 빈 계획으로 보고만 한다.
function proposedChanges(
  place: PlaceRow,
  detection: Detection,
): ProposedChanges {
  if (detection.confidence !== "high") return {};
  const observed = detection.observed;
  const proposal: ProposedChanges = {};

  if (
    detection.changeTypes.includes("name_changed") &&
    typeof observed.name === "string" && observed.name.trim()
  ) {
    proposal.name = observed.name.trim();
  }
  if (
    detection.changeTypes.includes("address_changed") &&
    typeof observed.address === "string" && observed.address.trim()
  ) {
    proposal.address = observed.address.trim();
  }
  if (
    detection.changeTypes.includes("phone_changed") &&
    typeof observed.phone === "string" && observed.phone.trim()
  ) {
    proposal.phone = observed.phone.trim();
  }
  if (
    detection.changeTypes.includes("moved") &&
    typeof observed.latitude === "number" &&
    typeof observed.longitude === "number"
  ) {
    proposal.latitude = observed.latitude;
    proposal.longitude = observed.longitude;
  }

  // 실제 사용자 정보 변경이 있을 때만 외부 식별자도 함께 고정한다. 식별자만 연결하는
  // 기술적 변경을 별도 승인 계획처럼 만들지는 않는다.
  if (
    Object.keys(proposal).length > 0 &&
    typeof observed.source_place_id === "string" &&
    observed.source_place_id &&
    (place.source_provider !== "kakao" ||
      place.source_place_id !== observed.source_place_id)
  ) {
    proposal.source_provider = "kakao";
    proposal.source_place_id = observed.source_place_id;
  }

  return proposal;
}

async function supabaseJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY ?? "",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function searchKakao(
  query: string,
  place: PlaceRow,
): Promise<KakaoResponse> {
  const params = new URLSearchParams({
    query,
    x: String(place.longitude),
    y: String(place.latitude),
    radius: "3000",
    size: "15",
    sort: "distance",
  });
  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } },
  );
  if (!response.ok) {
    throw new Error(
      `Kakao ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  return await response.json() as KakaoResponse;
}

async function collectCandidates(place: PlaceRow): Promise<{
  candidates: Candidate[];
  searches: Record<string, unknown>[];
}> {
  const queries = [place.name, place.address]
    .map((query) => query.trim())
    .filter((query, index, values) => query && values.indexOf(query) === index);
  const responses = await Promise.all(
    queries.map((query) => searchKakao(query, place)),
  );
  const unique = new Map<string, Candidate>();
  const searches: Record<string, unknown>[] = [];

  responses.forEach((response, index) => {
    searches.push({
      query: queries[index],
      total_count: response.meta.total_count,
      pageable_count: response.meta.pageable_count,
      received_count: response.documents.length,
      is_end: response.meta.is_end,
    });
    for (const document of response.documents) {
      const latitude = Number(document.y);
      const longitude = Number(document.x);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const candidate: Candidate = {
        ...document,
        latitude,
        longitude,
        distanceMeters: haversineMeters(place, { latitude, longitude }),
      };
      const existing = unique.get(document.id);
      if (!existing || candidate.distanceMeters < existing.distanceMeters) {
        unique.set(document.id, candidate);
      }
    }
  });

  return {
    candidates: [...unique.values()].sort((a, b) =>
      a.distanceMeters - b.distanceMeters
    ),
    searches,
  };
}

function chooseCandidate(place: PlaceRow, candidates: Candidate[]): {
  candidate: Candidate | null;
  matchReason: string;
  confidence: Confidence;
} {
  if (place.source_provider === "kakao" && place.source_place_id) {
    const sourceMatch = candidates.find((candidate) =>
      candidate.id === place.source_place_id
    );
    if (sourceMatch) {
      return {
        candidate: sourceMatch,
        matchReason: "source_place_id",
        confidence: "high",
      };
    }
  }

  const exactName = candidates.filter(
    (candidate) =>
      candidate.distanceMeters <= 500 &&
      normalizeText(candidate.place_name) === normalizeText(place.name),
  );
  if (exactName.length === 1) {
    return {
      candidate: exactName[0],
      matchReason: "exact_name_nearby",
      confidence: "high",
    };
  }

  const phone = normalizePhone(place.phone);
  if (phone) {
    const phoneMatches = candidates.filter(
      (candidate) =>
        candidate.distanceMeters <= 500 &&
        normalizePhone(candidate.phone) === phone,
    );
    if (phoneMatches.length === 1) {
      return {
        candidate: phoneMatches[0],
        matchReason: "same_phone_nearby",
        confidence: "medium",
      };
    }
  }

  const sameAddress = candidates.filter(
    (candidate) =>
      candidate.distanceMeters <= 100 &&
      addressesMatch(
        place.address,
        candidate.road_address_name || candidate.address_name,
      ),
  );
  if (sameAddress.length === 1) {
    return {
      candidate: sameAddress[0],
      matchReason: "same_address_nearby",
      confidence: "medium",
    };
  }

  const veryClose = candidates.filter(
    (candidate) =>
      candidate.distanceMeters <= 20 && sameCategory(place.category, candidate),
  );
  if (veryClose.length === 1) {
    return {
      candidate: veryClose[0],
      matchReason: "unique_category_within_20m",
      confidence: "medium",
    };
  }

  return {
    candidate: null,
    matchReason: "no_conservative_match",
    confidence: "low",
  };
}

function detectChanges(
  place: PlaceRow,
  candidates: Candidate[],
  searches: Record<string, unknown>[],
): Detection | null {
  const selected = chooseCandidate(place, candidates);
  if (!selected.candidate) {
    return {
      changeTypes: ["not_found"],
      confidence: "low",
      current: currentSnapshot(place),
      observed: {},
      evidence: {
        match_reason: selected.matchReason,
        candidate_count: candidates.length,
        nearest_candidates: candidates.slice(0, 5).map((candidate) => ({
          id: candidate.id,
          name: candidate.place_name,
          address: candidate.road_address_name || candidate.address_name,
          distance_m: Math.round(candidate.distanceMeters),
        })),
        searches,
      },
    };
  }

  const candidate = selected.candidate;
  const sourceIdentityMatched = place.source_provider === "kakao" &&
    place.source_place_id === candidate.id;
  const changeTypes: ChangeType[] = [];
  const sameName =
    normalizeText(place.name) === normalizeText(candidate.place_name);
  const observedAddress = candidate.road_address_name || candidate.address_name;

  if (!sameName) {
    changeTypes.push(
      sourceIdentityMatched ? "name_changed" : "possible_name_change",
    );
  }
  if (
    place.address && observedAddress &&
    !addressesMatch(place.address, observedAddress)
  ) {
    changeTypes.push("address_changed");
  }
  const currentPhone = normalizePhone(place.phone);
  const observedPhone = normalizePhone(candidate.phone);
  if (currentPhone && observedPhone && currentPhone !== observedPhone) {
    changeTypes.push("phone_changed");
  }
  if (candidate.distanceMeters > 100) {
    changeTypes.push("moved");
  }

  if (changeTypes.length === 0) return null;

  return {
    changeTypes: [...new Set(changeTypes)].sort() as ChangeType[],
    confidence: selected.confidence,
    current: currentSnapshot(place),
    observed: observedSnapshot(candidate),
    evidence: {
      match_reason: selected.matchReason,
      distance_m: Math.round(candidate.distanceMeters),
      candidate_count: candidates.length,
      source_identity_matched: sourceIdentityMatched,
      searches,
    },
  };
}

async function fingerprint(
  placeId: string,
  detection: Detection,
): Promise<string> {
  const payload = JSON.stringify({
    placeId,
    changeTypes: detection.changeTypes,
    observed: detection.observed,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function enqueueReview(
  place: PlaceRow,
  detection: Detection,
  proposal: ProposedChanges,
): Promise<{ reviewId: string; shouldReport: boolean }> {
  const rows = await supabaseJson<
    { review_id: string; should_report: boolean }[]
  >(
    "rpc/enqueue_place_change_review_v2",
    {
      method: "POST",
      body: JSON.stringify({
        p_place_id: place.id,
        p_fingerprint: await fingerprint(place.id, detection),
        p_change_types: detection.changeTypes,
        p_confidence: detection.confidence,
        p_source_provider: "kakao",
        p_current_snapshot: detection.current,
        p_observed_snapshot: detection.observed,
        p_evidence: detection.evidence,
        p_proposed_changes: proposal,
      }),
    },
  );
  const row = rows[0];
  if (!row) throw new Error("검토 대기열 결과가 비어 있습니다.");
  return { reviewId: row.review_id, shouldReport: row.should_report };
}

async function markReported(reviewId: string): Promise<void> {
  await supabaseJson<null>("rpc/mark_place_change_review_reported", {
    method: "POST",
    body: JSON.stringify({ p_review_id: reviewId }),
  });
}

function nextCheckAt(
  place: PlaceRow,
  result: "clean" | "change_detected" | "error",
): string {
  const days = result === "error"
    ? 1
    : result === "change_detected"
    ? 7
    : place.is_curation_protected ||
        ["viewpoint", "rest_stop", "camping"].includes(place.category)
    ? 90
    : 30;
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function saveState(
  place: PlaceRow,
  result: "clean" | "change_detected" | "error",
  error?: string,
): Promise<void> {
  await supabaseJson<null>("place_change_monitor_state?on_conflict=place_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      place_id: place.id,
      last_checked_at: new Date().toISOString(),
      next_check_at: nextCheckAt(place, result),
      last_result: result,
      last_error: result === "error"
        ? (error ?? "알 수 없는 오류").slice(0, 2000)
        : null,
      consecutive_failures: result === "error" ? 1 : 0,
      updated_at: new Date().toISOString(),
    }),
  });
}

function discordMessage(
  place: PlaceRow,
  detection: Detection,
  reviewId: string,
  proposal: ProposedChanges,
): string {
  const observed = detection.observed as Record<string, unknown>;
  const labels = detection.changeTypes.map((type) => CHANGE_LABELS[type]).join(
    ", ",
  );
  const confidence = detection.confidence === "high"
    ? "높음"
    : detection.confidence === "medium"
    ? "중간"
    : "낮음";
  const lines = [
    "🔎 **장소 변경 검토가 필요해요**",
    `**현재 장소:** ${place.name}`,
    `**감지:** ${labels} · 신뢰도 ${confidence}`,
    `**현재 주소:** ${place.address || "-"}`,
    `**관찰 상호:** ${String(observed.name ?? "-")}`,
    `**관찰 주소:** ${String(observed.address ?? "-")}`,
    `**관찰 전화:** ${String(observed.phone ?? "-")}`,
  ];
  if (observed.place_url) {
    lines.push(`**카카오:** ${String(observed.place_url)}`);
  }
  lines.push("", "**승인 시 반영 계획**");
  if (proposal.name) {
    lines.push(`- 상호: ${place.name} → ${proposal.name}`);
  }
  if (proposal.address) {
    lines.push(`- 주소: ${place.address || "-"} → ${proposal.address}`);
  }
  if (proposal.phone) {
    lines.push(`- 전화: ${place.phone || "-"} → ${proposal.phone}`);
  }
  if (
    proposal.latitude !== undefined && proposal.longitude !== undefined
  ) {
    lines.push(
      `- 위치: ${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)} → ${proposal.latitude.toFixed(6)}, ${proposal.longitude.toFixed(6)}`,
    );
  }
  if (proposal.source_place_id) {
    lines.push(
      `- 카카오 장소 연결: ${place.source_place_id || "없음"} → ${proposal.source_place_id} (같은 일반 장소 기록이 있으면 등록 장소로 승계)`,
    );
  }
  if (Object.keys(proposal).length === 0) {
    lines.push("- 안전하게 자동 반영할 항목 없음 — 직접 확인 후 유지하거나 별도 수정");
  }
  lines.push(
    `**검토 ID:** \`${reviewId}\``,
    "",
    Object.keys(proposal).length > 0
      ? "아직 반영하지 않았어요. 아래 버튼을 누르면 위 계획만 원자적으로 반영해요."
      : "아직 반영하지 않았어요. 변경 없음으로 닫거나 별도 확인이 필요해요.",
  );
  return lines.join("\n").slice(0, 1900);
}

function discordComponents(
  reviewId: string,
  canApply: boolean,
): Record<string, unknown>[] {
  const buttons: Record<string, unknown>[] = [];
  if (canApply) {
    buttons.push({
      type: 2,
      style: 3,
      label: "계획대로 반영",
      custom_id: `placechange:apply:${reviewId}`,
    });
  }
  buttons.push({
    type: 2,
    style: 2,
    label: "변경 없음",
    custom_id: `placechange:dismiss:${reviewId}`,
  });
  return [{ type: 1, components: buttons }];
}

async function postDiscord(
  content: string,
  reviewId: string,
  canApply: boolean,
): Promise<void> {
  let response: Response;
  if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
    response = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          components: discordComponents(reviewId, canApply),
        }),
      },
    );
  } else if (DISCORD_WEBHOOK_URL) {
    response = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } else {
    throw new Error("Discord 보고용 환경변수가 없습니다.");
  }
  if (!response.ok) {
    throw new Error(
      `Discord ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
}

async function inspectPlace(
  place: PlaceRow,
  dryRun: boolean,
): Promise<MonitorResult> {
  try {
    const { candidates, searches } = await collectCandidates(place);
    const detection = detectChanges(place, candidates, searches);

    if (!detection) {
      if (!dryRun) await saveState(place, "clean");
      return { placeId: place.id, placeName: place.name, result: "clean" };
    }

    if (dryRun) {
      return {
        placeId: place.id,
        placeName: place.name,
        result: "change_detected",
        changeTypes: detection.changeTypes,
      };
    }

    const proposal = proposedChanges(place, detection);
    const { reviewId, shouldReport } = await enqueueReview(
      place,
      detection,
      proposal,
    );
    if (shouldReport) {
      await postDiscord(
        discordMessage(place, detection, reviewId, proposal),
        reviewId,
        Object.keys(proposal).length > 0,
      );
      await markReported(reviewId);
    }
    await saveState(place, "change_detected");
    return {
      placeId: place.id,
      placeName: place.name,
      result: "change_detected",
      reviewId,
      changeTypes: detection.changeTypes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun) {
      try {
        await saveState(place, "error", message);
      } catch (stateError) {
        console.error("장소 변경 점검 상태 저장 실패", place.id, stateError);
      }
    }
    return {
      placeId: place.id,
      placeName: place.name,
      result: "error",
      error: message,
    };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    assertEnvironment();
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }

  if (request.headers.get("x-place-change-secret") !== MONITOR_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { limit?: number; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 8), 1), 20);
  const dryRun = body.dryRun === true;

  try {
    const batchRpc = dryRun
      ? "rpc/get_place_change_monitor_batch"
      : "rpc/claim_place_change_monitor_batch";
    const places = await supabaseJson<PlaceRow[]>(batchRpc, {
      method: "POST",
      body: JSON.stringify({ p_limit: limit }),
    });
    const results: MonitorResult[] = [];
    for (const place of places) {
      results.push(await inspectPlace(place, dryRun));
    }
    return json({
      dryRun,
      checked: results.length,
      clean: results.filter((result) => result.result === "clean").length,
      changes: results.filter((result) =>
        result.result === "change_detected"
      ).length,
      errors: results.filter((result) => result.result === "error").length,
      results,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
