import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';

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
