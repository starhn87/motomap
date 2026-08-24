// 앱 스토어 주소 — 공유 문구와 업데이트 안내가 함께 쓴다.
// 한 군데에 둬야 앱 id 가 바뀌거나 링크 형식이 달라질 때 어긋나지 않는다.
export const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6773636183';

// 앱 설치 여부와 관계없이 공유할 수 있는 공개 주소. 설치된 iOS 앱에서는
// 유니버설 링크로 상세 화면이 열리고, 웹으로 떨어진 환경에서도 앱을 먼저 열어 본다.
export const APP_WEB_URL = 'https://motomap.kr';

export function placeWebUrl(placeId: string): string {
  return `${APP_WEB_URL}/place/${encodeURIComponent(placeId)}`;
}

export function courseWebUrl(courseId: string): string {
  return `${APP_WEB_URL}/course/${encodeURIComponent(courseId)}`;
}

export function ridingGuideWebUrl(guideId: string): string {
  return `${APP_WEB_URL}/riding/${encodeURIComponent(guideId)}`;
}
