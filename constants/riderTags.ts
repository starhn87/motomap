export const HIGHLIGHT_TAGS: ReadonlySet<string> = new Set([
  '바이크카페',
  '모토라드',
  'BMW',
  '심야영업',
  '야간영업',
  '야간라이딩',
  '24시간무인',
  '바이크체험',
  '바이크전시',
  '바이크시승',
  '바이크주차',
  '정비지원',
  '세차',
  '헬멧보관',
  '대형카페',
  '로스터리',
]);

export function isHighlightTag(tag: string): boolean {
  return HIGHLIGHT_TAGS.has(tag);
}
