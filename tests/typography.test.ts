import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadModule } from './helpers/loadModule';

test('바이너리에 서체가 있는 경우만 Pretendard를 선택하고 이전 설치본은 시스템으로 폴백한다', () => {
  for (const loaded of [true, false]) {
    const fonts = loadModule<any>('lib/typography.ts', { 'expo-font': { isLoaded: () => loaded } });
    assert.equal(fonts.APP_FONT_FAMILY, loaded ? 'Pretendard' : undefined);
  }
});

test('앱 Text/Input은 ref·접근성·편집 이벤트·기존 크기와 굵기를 보존한다', () => {
  const jsx = (type: any, props: any) => ({ type, props });
  const module = loadModule<any>('components/ui/AppText.tsx', {
    react: { forwardRef: (render: any) => render }, 'react/jsx-runtime': { jsx },
    'react-native': { Text: 'Text', TextInput: 'Input' },
    '@/lib/typography': { APP_FONT_STYLE: { fontFamily: 'Pretendard' } },
  });
  const ref = {}, onChangeText = () => {}, style = { fontSize: 18, fontWeight: '700' };
  for (const Component of [module.Text, module.TextInput]) {
    const result = Component({ style, accessibilityLabel: '입력', allowFontScaling: true, onChangeText }, ref);
    assert.equal(result.props.ref, ref);
    assert.equal(result.props.style[0].fontFamily, 'Pretendard');
    assert.equal(result.props.style[1], style);
    assert.equal(result.props.allowFontScaling, true);
    assert.equal(result.props.onChangeText, onChangeText);
  }
});

test('번들 서체는 공식 배포의 원본9굵기와 전체 OFL 고지를 보존한다', () => {
  const sources = JSON.parse(readFileSync('assets/fonts/sources.json', 'utf8'));
  assert.equal(sources.files.length, 9);
  for (const file of sources.files) {
    const bytes = readFileSync(`assets/fonts/${file.file}`);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.ok(file.source.startsWith('https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/'));
  }
  assert.equal(JSON.parse(readFileSync('assets/fonts/license.json', 'utf8')).text, readFileSync('assets/fonts/OFL.txt', 'utf8'));
});

test('iOS 길안내 RN 패널은 앱에 포함된 Pretendard를 쓴다', () => {
  const panel = readFileSync('components/navigation/IOSGuidePanel.tsx', 'utf8');
  for (const weight of ['Regular', 'SemiBold', 'Bold']) {
    assert.ok(panel.includes(`Pretendard-${weight}`));
    assert.ok(readFileSync(`assets/fonts/Pretendard-${weight}.otf`).length > 0);
  }
});
