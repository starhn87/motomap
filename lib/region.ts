// 시도 표기를 축약형("경기", "강원")으로 통일한다.
// 카카오 로컬은 정식 명칭("강원특별자치도")을 주고 DB 시드는 축약형이 섞여 있어,
// 그대로 두면 같은 지역이 두 이름으로 나란히 보인다. 축약형이 한 줄 표시와
// 지역 칩에 유리해 이쪽을 기준으로 삼는다. scripts/normalize-addresses.mjs 가
// DB 를 같은 규칙으로 정리했고, 카카오에서 새로 들어오는 주소는 여기서 맞춘다.
const SIDO: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주도: '제주',
  제주특별자치도: '제주',
};

export function normalizeSido(address: string | null | undefined): string {
  const value = (address ?? '').trim();
  const head = value.split(' ')[0];
  const short = SIDO[head];
  return short ? `${short}${value.slice(head.length)}` : value;
}

// 주소의 첫 토큰이 시도 — 위 규칙으로 축약형 하나로 통일돼 있다.
export function regionOf(address: string | null | undefined): string | null {
  const head = normalizeSido(address).split(' ')[0];
  return head || null;
}
