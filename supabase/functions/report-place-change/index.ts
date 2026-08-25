import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import { enforceRateLimits } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REASON_LABELS = {
  permanently_closed: "폐업",
  temporarily_closed: "임시 휴업",
  moved: "이전",
  business_info_changed: "상호·주소·전화 변경",
  other: "기타",
} as const;

type PlaceChangeReason = keyof typeof REASON_LABELS;

interface PlaceRow {
  id: string;
  name: string;
  address: string;
  approved: boolean;
  deleted_at: string | null;
}

interface ReportRow {
  id: string;
  reason: PlaceChangeReason;
  description: string | null;
  discord_reported_at: string | null;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function isReason(value: unknown): value is PlaceChangeReason {
  return typeof value === "string" && value in REASON_LABELS;
}

function discordContent(
  reportId: string,
  place: PlaceRow,
  reason: PlaceChangeReason,
  description: string | null,
): string {
  const detail = description
    ? description.replace(/\s+/g, " ").replace(/`/g, "ˋ").slice(0, 500)
    : "없음";
  return [
    "📣 **사용자 장소 정보 제보가 왔어요**",
    `**장소:** ${place.name}`,
    `**주소:** ${place.address || "-"}`,
    `**변경 유형:** ${REASON_LABELS[reason]}`,
    `**상세:** ${detail}`,
    `**제보 ID:** \`${reportId}\``,
    "",
    "장소는 아직 변경하지 않았어요. 직접 확인한 뒤 별도 반영해주세요.",
  ].join("\n").slice(0, 1900);
}

async function postDiscord(content: string): Promise<void> {
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
          allowed_mentions: { parse: [] },
        }),
      },
    );
  } else if (DISCORD_WEBHOOK_URL) {
    response = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "서버 설정이 완료되지 않았습니다." }, 503);
  }

  try {
    const limited = await enforceRateLimits(req, [
      { scope: "place-change-report-user", limit: 10, windowSeconds: 86_400 },
    ]);
    if (limited) return limited;

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "로그인이 필요합니다." }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(
      token,
    );
    const user = userData.user;
    if (userError || !user) return json({ error: "로그인이 필요합니다." }, 401);

    const body = await req.json().catch(() => null) as
      | Record<string, unknown>
      | null;
    const placeId = body?.placeId;
    const reason = body?.reason;
    const rawDescription = typeof body?.description === "string"
      ? body.description.trim()
      : "";
    const description = rawDescription || null;

    if (!isUuid(placeId) || !isReason(reason)) {
      return json({ error: "제보 정보를 다시 확인해주세요." }, 400);
    }
    if (description && description.length > 500) {
      return json({ error: "상세 설명은 500자까지 입력할 수 있어요." }, 400);
    }

    const { data: placeData, error: placeError } = await admin
      .from("places")
      .select("id,name,address,approved,deleted_at")
      .eq("id", placeId)
      .maybeSingle();
    const place = placeData as PlaceRow | null;
    if (placeError) throw placeError;
    if (!place || !place.approved || place.deleted_at) {
      return json(
        { error: "현재 등록된 장소만 정보를 제보할 수 있어요." },
        404,
      );
    }

    let report: ReportRow | null = null;
    const { data: inserted, error: insertError } = await admin
      .from("place_change_reports")
      .insert({
        reporter_id: user.id,
        place_id: place.id,
        reason,
        description,
      })
      .select("id,reason,description,discord_reported_at")
      .single();

    if (!insertError) {
      report = inserted as ReportRow;
    } else if (insertError.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("place_change_reports")
        .select("id,reason,description,discord_reported_at")
        .eq("reporter_id", user.id)
        .eq("place_id", place.id)
        .eq("status", "pending")
        .maybeSingle();
      if (existingError) throw existingError;
      report = existing as ReportRow | null;
      if (report?.discord_reported_at) {
        return json({ error: "이미 검토 중인 제보가 있어요." }, 409);
      }
    } else {
      throw insertError;
    }

    if (!report) throw new Error("저장된 장소 정보 제보를 찾지 못했습니다.");

    try {
      await postDiscord(
        discordContent(report.id, place, report.reason, report.description),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin
        .from("place_change_reports")
        .update({ discord_error: message.slice(0, 1000) })
        .eq("id", report.id);
      console.error("report-place-change Discord failed", {
        reportId: report.id,
        error: message.slice(0, 300),
      });
      return json(
        {
          error:
            "제보는 저장했지만 운영 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.",
        },
        503,
      );
    }

    const { error: markError } = await admin
      .from("place_change_reports")
      .update({
        discord_reported_at: new Date().toISOString(),
        discord_error: null,
      })
      .eq("id", report.id);
    if (markError) {
      console.error("report-place-change mark failed", {
        reportId: report.id,
        error: markError.message,
      });
    }

    return json({ ok: true, reportId: report.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("report-place-change failed", message.slice(0, 500));
    return json({ error: "장소 정보 제보를 접수하지 못했습니다." }, 500);
  }
});
