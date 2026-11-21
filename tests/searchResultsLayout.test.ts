import assert from 'node:assert/strict';
import test from 'node:test';
import { getSearchResultsSheetSnapPoints } from '../lib/searchResultsLayout';

test('검색 결과 최대 확장은 재검색 버튼 아래에 12dp 이상을 남긴다', () => {
  for (const [height, inset, buttonHeight] of [
    [844, 59, 36], [780, 24, 36], [932, 59, 44], [667, 20, 72], [320, 59, 50],
  ]) {
    const buttonBottom = inset + 62 + buttonHeight;
    const points = getSearchResultsSheetSnapPoints(height, 20, buttonBottom);
    assert.ok(height - points[2] >= buttonBottom + 12);
    assert.ok(points[2] <= height * 0.85);
    assert.ok(points[0] < points[1] && points[1] < points[2]);
  }
});

test('적은 결과는 칩이 없는 헤더 높이에 맞추고 많은 결과는 중간 높이를 제한한다', () => {
  assert.equal(getSearchResultsSheetSnapPoints(844, 2, 157)[1], 184);
  assert.equal(getSearchResultsSheetSnapPoints(844, 50, 157)[1], 380);
});

test('화면이나 재검색 버튼의 실측 크기가 바뀌면 최대 높이도 맞춘다', () => {
  const first = getSearchResultsSheetSnapPoints(844, 20, 157);
  const largerText = getSearchResultsSheetSnapPoints(844, 20, 197);
  const smallerContainer = getSearchResultsSheetSnapPoints(800, 20, 157);
  assert.equal(first[2] - largerText[2], 40);
  assert.equal(first[2] - smallerContainer[2], 44);
});
