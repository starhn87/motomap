// 공급자 응답 테스트는 명시적으로 동의된 상태를 사용한다. 실제 차단은 별도 store 테스트한다.
export const allowedLocationPrivacy = {
  requireLocationUse() {},
  locationUseAllowed: () => true,
  providerLocationAllowed: () => true,
  useLocationPrivacyStore: <T>(selector: (state: {revision: number}) => T) => selector({revision:0}),
  withLocationUse: async <T>(_purpose: string, _recipient: string, work: () => Promise<T>) => work(),
  withCoordinateUse: async <T>(_point: unknown, _purpose: string, _recipient: string, work: () => Promise<T>) => work(),
};
