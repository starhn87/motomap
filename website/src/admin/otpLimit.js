// 한도는 이 Worker 인스턴스 메모리에만 쌓인다. 인스턴스가 여럿이면 시간당 5회가
// 전역으로 보장되지 않는다. 공유 저장소로 옮기는 일은 이번 범위가 아니다.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const hits = new Map();

function recent(key, now) {
  const kept = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.set(key, kept);
  return kept;
}

export function otpAttemptAllowed({ ip, email, now = Date.now() }) {
  const ipHits = recent(`ip:${ip}`, now);
  const emailHits = recent(`email:${email}`, now);
  if (ipHits.length >= MAX_ATTEMPTS || emailHits.length >= MAX_ATTEMPTS) return false;
  ipHits.push(now);
  emailHits.push(now);
  return true;
}

export function resetOtpAttempts() {
  hits.clear();
}

export async function finishOtpResponse(started, sleep, now = Date.now()) {
  const jitter = crypto.getRandomValues(new Uint32Array(1))[0] % 40;
  const wait = Math.max(0, 250 + jitter - (now - started));
  if (wait > 0) await sleep(wait);
}
