const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 초안 점검과 실제 시행 준비 점검을 구분한다. 날짜만 바꿔 새 동의를 받지 않는다. */
export function legalPublicationErrors(value: unknown, requireReady = false): string[] {
  if (!value || typeof value !== 'object') return ['고지 설정이 없습니다.'];
  const release = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof release.revision !== 'string' || !release.revision) errors.push('개정 식별자가 없습니다.');
  if (release.status !== 'draft' && release.status !== 'active') errors.push('고지 상태가 올바르지 않습니다.');
  if (!isDate(release.currentConsentVersion)) errors.push('현재 동의 버전이 올바르지 않습니다.');
  for (const field of ['effectiveDate', 'noticeDate', 'consentVersion'] as const) {
    if (release[field] !== null && !isDate(release[field])) errors.push(`${field} 날짜가 올바르지 않습니다.`);
  }
  if (requireReady || release.status === 'active') {
    if (release.status !== 'active') errors.push('개정 문서가 아직 초안입니다.');
    if (!isDate(release.effectiveDate)) errors.push('재개일·시행일 확정이 필요합니다.');
    if (!isDate(release.noticeDate)) errors.push('실제 사전 고지일 기록이 필요합니다.');
    if (!isDate(release.consentVersion) || release.consentVersion !== release.effectiveDate ||
      release.consentVersion !== release.currentConsentVersion) {
      errors.push('시행일과 현재 서버·가입 동의 버전 동기화가 필요합니다.');
    }
  }
  if (isDate(release.noticeDate) && isDate(release.effectiveDate) && release.noticeDate > release.effectiveDate) {
    errors.push('고지일이 시행일보다 늦습니다.');
  }
  return errors;
}
