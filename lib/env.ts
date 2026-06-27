// 필수 환경변수 검증 — 누락 시 첫 네트워크 호출에서 opaque하게 실패하는 대신
// 로드 시점에 명확한 에러를 던진다(fail-fast).
//
// ⚠️ Expo(Metro)는 `process.env.EXPO_PUBLIC_*` 를 빌드 타임에 **정적 멤버 접근만**
// 인라인한다. 반드시 정적으로 읽은 값을 인자로 넘길 것 — `process.env[name]` 같은
// 동적 접근은 인라인되지 않아 런타임에 항상 undefined 가 된다.
export function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `필수 환경변수 ${name} 가 비어 있습니다. .env 또는 EAS 환경변수를 확인하세요.`,
    );
  }
  return value;
}
