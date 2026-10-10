// 내부 검증 정비 창: 공개 채널은 계속 닫고 내부 1.2.8만 진입한다.
// active 전환은 OPS-003의 실기기 검증 후 별도 승인으로 진행한다.
export const serviceStatus = Object.freeze({
  schemaVersion: 1,
  status: 'preparing',
  minimumAppVersion: '1.2.8',
  storeUrl: 'https://apps.apple.com/kr/app/id6773636183',
  message: '모토맵 운영 재개를 준비하고 있어요.',
});
