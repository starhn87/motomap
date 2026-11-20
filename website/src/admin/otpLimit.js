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
