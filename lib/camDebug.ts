// 카메라 이동 출처 진단 — "검색 복귀 때 내 위치가 잠깐 보인다" 추적용 임시 계측.
// 어떤 코드가 카메라를 움직였는지 태그를 쌓고, 지도 탭의 HUD 가 보여준다.
// 원인이 확정되면 통째로 걷어낸다.

type Listener = (lines: string[]) => void;

const MAX = 7;
let lines: string[] = [];
let listener: Listener | null = null;

export function logCam(tag: string) {
  const t = new Date();
  const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(Math.floor(t.getMilliseconds() / 100))}`;
  lines = [`${stamp} ${tag}`, ...lines].slice(0, MAX);
  listener?.(lines);
}

export function subscribeCamLog(fn: Listener | null) {
  listener = fn;
  fn?.(lines);
}
