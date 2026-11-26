import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const rules = read('config/kakao-android-r8.pro');
const config = new Script(read('app.config.js').replace('export default', 'module.exports ='))
  .runInNewContext({
    require: createRequire(new URL('../app.config.js', import.meta.url)),
    module: { exports: {} },
    process: { env: {} },
  }) as {
    expo: {
      plugins: (string | [string, { android?: { extraProguardRules?: string; enableMinifyInReleaseBuilds?: boolean } }])[];
    };
  };

function androidBuildProperties() {
  const plugin = config.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties');
  assert.ok(Array.isArray(plugin));
  return plugin[1].android;
}

test('카카오 R8 규칙은 공식 enum 필드 keep과 직렬화 어노테이션을 포함한다', () => {
  for (const rule of [
    '-keep class com.kakao.sdk.**.model.* { <fields>; }',
    '-keep class com.kakao.sdk.**.model.** { <fields>; }',
    '-keepclassmembers enum com.kakao.sdk.** {',
    'public static ** valueOf(java.lang.String);',
    '-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod',
    '-keep class * extends com.google.gson.TypeAdapter',
    '-keep interface com.kakao.sdk.**.*Api',
  ]) {
    assert.equal(rules.includes(rule), true, rule);
  }
});

test('expo-build-properties가 그 규칙을 넣고 release minify는 이 변경에서 켜지 않는다', () => {
  const android = androidBuildProperties();
  assert.equal(android?.extraProguardRules, rules);
  assert.equal(android?.enableMinifyInReleaseBuilds, undefined);
});
