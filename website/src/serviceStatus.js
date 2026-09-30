// 운영 재개를 검증하기 전에는 이 파일을 배포해도 항상 중단 상태를 반환한다.
// 활성화는 신고 수리와 OPS-003의 실기기 검증 후 별도 변경으로 진행한다.
export const serviceStatus = Object.freeze({
  schemaVersion: 1,
  status: 'suspended',
  minimumAppVersion: '1.2.8',
  storeUrl: 'https://apps.apple.com/kr/app/id6773636183',
  message: '모토맵은 현재 운영을 일시 중단했어요.',
});
