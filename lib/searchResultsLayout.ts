export const SEARCH_AREA_BUTTON_TOP = 62;

export function getSearchResultsSheetSnapPoints(
  height: number,
  resultCount: number,
  searchAreaBottom: number,
): [number, number, number] {
  const collapsed = 88;
  const expanded = Math.max(collapsed + 2, Math.floor(Math.min(height * 0.85, height - searchAreaBottom - 12)));
  // 칩 없는 결과 수 헤더와 이름·주소·메타가 있는 행의 예상 높이다.
  const content = 24 + resultCount * 80;
  const middle = Math.min(expanded - 1, Math.round(Math.max(180, Math.min(content, height * 0.45))));
  return [collapsed, middle, expanded];
}
