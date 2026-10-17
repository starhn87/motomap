/** 같은 신호라도 새 DB 상태·새 검증 주기에서는 근거와 고정 승인안을 새로 만든다. */
export async function placeChangeFingerprint(
  placeId: string,
  current: Record<string, unknown>,
  observed: Record<string, unknown>,
  changeTypes: string[],
  now = Date.now(),
): Promise<string> {
  const payload = JSON.stringify({
    version: 2,
    placeId,
    current,
    observed,
    changeTypes,
    observationWindow: Math.floor(now / (7 * 24 * 60 * 60 * 1000)),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
