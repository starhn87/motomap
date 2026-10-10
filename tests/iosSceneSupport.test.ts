import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';

// 설정·상류 전달 경로의 회귀 검사다. 생성 프로젝트·native compile·실기기 검증은 별도로 한다.
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const config = new Script(read('app.config.js').replace('export default', 'module.exports ='))
  .runInNewContext({
    require: createRequire(new URL('../app.config.js', import.meta.url)),
    module: { exports: {} },
    process: { env: {} },
  }) as { expo: { plugins: (string | [string, { ios?: Record<string, unknown> }])[] } };

function iosOptions(name: string) {
  const plugin = config.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === name);
  assert.ok(Array.isArray(plugin), `${name} 설정이 필요합니다.`);
  return plugin[1].ios;
}

test('iOS 27 scene 지원과 카카오 URL 전달 설정을 함께 유지한다', () => {
  assert.equal(iosOptions('expo-build-properties')?.enableSceneSupport, true);
  assert.equal(iosOptions('@react-native-kakao/core')?.handleKakaoOpenUrl, true);
});

test('Expo scene이 기존 AppDelegate URL·수명주기로 전달하는 경로를 유지한다', () => {
  const scene = read('node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift');
  const forwarder = read('node_modules/expo/ios/AppDelegates/SceneEventForwarder.swift');
  assert.match(scene, /provider\.window = window/);
  assert.match(scene, /forwarder\.open\(url:/);
  assert.match(forwarder, /delegate\?\.application\(application, open: url, options: options\)/);
  for (const method of [
    'applicationDidBecomeActive',
    'applicationWillResignActive',
    'applicationWillEnterForeground',
    'applicationDidEnterBackground',
  ]) {
    assert.ok(forwarder.includes(`appDelegate()?.${method}(UIApplication.shared)`));
  }
});
