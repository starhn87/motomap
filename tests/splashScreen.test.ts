import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';

const configUrl = new URL('../app.config.js', import.meta.url);
const config = new Script(readFileSync(configUrl, 'utf8').replace('export default', 'module.exports ='))
  .runInNewContext({
    require: createRequire(configUrl), module: { exports: {} }, process: { env: {} },
  }) as { expo: {
    splash: { image: string; resizeMode: string; backgroundColor: string };
    plugins: (string | [string, { image?: string; resizeMode?: string; backgroundColor?: string;
      ios?: { enableFullScreenImage_legacy?: boolean } }])[];
  } };

test('스플래시 플러그인은 기존 바이크 원본·배경·iOS 전체 화면 contain을 유지한다', () => {
  const plugins = config.expo.plugins.filter((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen');
  assert.equal(plugins.length, 1);
  const entry = plugins[0];
  assert.ok(Array.isArray(entry));
  const options = entry[1];
  assert.equal(options.image, './assets/images/splash-icon.png');
  assert.equal(options.image, config.expo.splash.image);
  assert.equal(options.backgroundColor, '#0A0A0A');
  assert.equal(options.backgroundColor, config.expo.splash.backgroundColor);
  assert.equal(options.resizeMode, 'contain');
  assert.equal(options.ios?.enableFullScreenImage_legacy, true);
});

test('운영 상태 확인·lazy 로딩도 별도 앱 아이콘 화면 대신 원본 스플래시를 이어서 그린다', () => {
  const source = readFileSync(new URL('../components/ServiceLoadingScreen.tsx', import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
  const module = { exports: {} as { default?: () => any } };
  const absoluteFill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 };
  new Script(code).runInNewContext({
    module, exports: module.exports,
    require: (name: string) => {
      if (name === 'react-native') return {
        Image: 'Image', View: 'View',
        StyleSheet: { create: (styles: unknown) => styles, absoluteFill },
      };
      if (name === 'react/jsx-runtime') return {
        jsx: (type: unknown, props: unknown) => ({ type, props }),
      };
      if (name === '../assets/images/splash-icon.png') return name;
      throw new Error(`예상하지 않은 로딩 화면 의존성: ${name}`);
    },
  });
  const tree = module.exports.default!();
  assert.equal(tree.type, 'View');
  assert.equal(tree.props.style.backgroundColor, config.expo.splash.backgroundColor);
  assert.equal(tree.props.style.flex, 1);
  assert.equal(tree.props.accessibilityLabel, '모토맵을 준비하고 있어요');
  assert.equal(tree.props.children.type, 'Image');
  assert.equal(tree.props.children.props.source, '../assets/images/splash-icon.png');
  assert.equal(tree.props.children.props.resizeMode, 'contain');
  assert.equal(tree.props.children.props.style, absoluteFill);
});
