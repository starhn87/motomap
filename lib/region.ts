// 주소의 첫 토큰이 시도 — scripts/normalize-addresses.mjs 로 축약형("경기", "강원")
// 하나로 통일돼 있다. 카카오 로컬이 주는 형식이라 신규 제보도 같은 모양으로 들어온다.
export function regionOf(address: string | null | undefined): string | null {
  const head = (address ?? '').trim().split(' ')[0];
  return head || null;
}
