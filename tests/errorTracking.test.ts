import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  attachErrorTrackingRuntime,
  captureHandledException,
  ERROR_TRACKING_OPTIONS,
  recordReleaseExceptionStep,
  scrubCaptureEvent,
  scrubDiagnosticString,
} from '../lib/errorTracking';
import { errorTrackingProbeAllowed, runHandledErrorProbe } from '../lib/errorTrackingProbe';
import { isPostHogCliHost, isPostHogIngestionHost, nativeCrashAutocaptureForPlatform } from '../lib/posthogProject';
import {
  assertUploadCredentials,
  assertUploadHost,
  resolveUploadDirectory,
  uploadBlockedReason,
} from '../scripts/upload-posthog-hermes.mjs';
import { probeConfigPlugins, probeHostModule } from '../config/errorTrackingProbe.cjs';

const release = () => ({
  app_version: '1.2.11',
  build_number: '71',
  runtime_version: '1.2.11',
  update_id: 'embedded',
  update_source: 'embedded' as const,
  native_bridge_version: 41,
  api_contract_version: 1,
});

test('진단 문자열에서 메일·토큰·좌표만 가린다', () => {
  const scrubbed = scrubDiagnosticString(
    'user@example.com Bearer abc.def phc_public phx_upload eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U ExponentPushToken[secret] 37.123456, 127.654321 카페',
  );
  assert.equal(scrubbed.includes('user@example.com'), false);
  assert.equal(scrubbed.includes('abc.def'), false);
  assert.equal(scrubbed.includes('phc_public'), false);
  assert.equal(scrubbed.includes('phx_upload'), false);
  assert.equal(scrubbed.includes('eyJhbGciOi'), false);
  assert.equal(scrubbed.includes('ExponentPushToken'), false);
  assert.equal(scrubbed.includes('37.123456'), false);
  assert.match(scrubbed, /카페/);
});

test('예외 이벤트는 입력·메일·좌표를 지우고 릴리스 태그는 남긴다', () => {
  const event = scrubCaptureEvent({
    event: '$exception',
    properties: {
      token: 'phc_project_ingestion_token',
      app_version: '1.2.11',
      email: 'rider@example.com',
      query: '한강 라이딩',
      latitude: 37.123456,
      $exception_list: [{
        type: 'Error',
        value: 'failed for rider@example.com at 37.123456,127.654321',
      }],
    },
  });
  assert.ok(event);
  const properties = event.properties as Record<string, unknown>;
  assert.equal(properties.token, 'phc_project_ingestion_token');
  assert.equal(properties.app_version, '1.2.11');
  assert.equal(properties.email, '[redacted]');
  assert.equal(properties.query, '[redacted]');
  assert.equal(properties.latitude, '[redacted]');
  const list = properties.$exception_list as { type: string; value: string }[];
  assert.equal(list[0].value.includes('rider@example.com'), false);
  assert.equal(list[0].value.includes('37.123456'), false);
  assert.equal(list[0].type, 'Error');
});

test('제품 이벤트의 검색어는 유지하고 메일과 좌표 키는 지운다', () => {
  const event = scrubCaptureEvent({
    event: 'search_submitted',
    properties: { query: '한강 카페', email: 'rider@example.com', latitude: 37.5 },
  });
  assert.ok(event);
  const properties = event.properties as Record<string, string | number>;
  assert.equal(properties.query, '한강 카페');
  assert.equal(properties.email, '[redacted]');
  assert.equal(properties.latitude, '[redacted]');
});

test('처리된 예외는 릴리스 태그와 함께 보내고 민감 속성은 빼며 클라이언트가 없으면 조용하다', () => {
  const captured: unknown[] = [];
  attachErrorTrackingRuntime(null);
  captureHandledException(new Error('rider@example.com'), { area: 'auth_restore', email: 'rider@example.com' });
  assert.equal(captured.length, 0);

  attachErrorTrackingRuntime({
    captureException(error, properties) { captured.push({ error, properties }); },
    getReleaseContext: release,
  });
  captureHandledException(new Error('token phx_secret'), {
    area: 'auth_restore',
    auth_restore_stage: 'profile',
    email: 'rider@example.com',
    query: '집 주소',
  });
  const sent = captured[0] as { error: Error; properties: Record<string, unknown> };
  assert.equal(sent.properties.handled, true);
  assert.equal(sent.properties.app_version, '1.2.11');
  assert.equal(sent.properties.update_id, 'embedded');
  assert.equal(sent.properties.runtime_version, '1.2.11');
  assert.equal(sent.properties.build_number, '71');
  assert.equal(sent.properties.area, 'auth_restore');
  assert.equal(sent.properties.email, undefined);
  assert.equal(sent.properties.query, undefined);
  assert.equal(sent.error.message.includes('phx_secret'), false);
  attachErrorTrackingRuntime(null);
});

test('릴리스 예외 단계에는 버전 문맥만 담긴다', () => {
  const steps: unknown[] = [];
  attachErrorTrackingRuntime({
    captureException() {},
    addExceptionStep(message, properties) { steps.push({ message, properties }); },
    getReleaseContext: release,
  });
  recordReleaseExceptionStep();
  assert.deepEqual(steps, [{ message: 'app_release', properties: release() }]);
  attachErrorTrackingRuntime(null);
});

test('자동 수집은 미처리 예외만 기본으로 켜고 네이티브 크래시는 iOS에서만 켠다', () => {
  assert.equal(ERROR_TRACKING_OPTIONS.autocapture.uncaughtExceptions, true);
  assert.equal(ERROR_TRACKING_OPTIONS.autocapture.unhandledRejections, true);
  assert.deepEqual(ERROR_TRACKING_OPTIONS.autocapture.console, []);
  assert.equal('nativeCrashes' in ERROR_TRACKING_OPTIONS.autocapture, false);
  assert.equal('androidNdkCrashes' in ERROR_TRACKING_OPTIONS.autocapture, false);
  assert.equal(nativeCrashAutocaptureForPlatform('ios'), true);
  assert.equal(nativeCrashAutocaptureForPlatform('android'), false);
});

test('scrub은 큐와 네트워크 전송보다 먼저 실행되는 before_send다', () => {
  const sdk = readFileSync(new URL('../node_modules/@posthog/core/dist/posthog-core-stateless.js', import.meta.url), 'utf8');
  const enqueue = sdk.slice(sdk.indexOf('enqueue(type'), sdk.indexOf('async sendImmediate'));
  assert.ok(enqueue.indexOf('processBeforeEnqueue') < enqueue.indexOf('queue.push'));
  const immediate = sdk.slice(sdk.indexOf('async sendImmediate'), sdk.indexOf('async sendImmediate') + 900);
  const beforeSend = immediate.indexOf('processBeforeEnqueue');
  const dropped = immediate.indexOf('null === message');
  const batch = immediate.indexOf('sendBatch');
  assert.ok(beforeSend !== -1 && dropped !== -1 && batch !== -1);
  assert.ok(beforeSend < dropped && dropped < batch);
  const analytics = readFileSync(new URL('../lib/analytics.ts', import.meta.url), 'utf8');
  assert.match(analytics, /before_send: \(event\) => scrubCaptureEvent\(event\)/);
});

test('기존 EU 프로젝트가 아닌 호스트는 수집과 업로드를 거절한다', () => {
  assert.equal(isPostHogIngestionHost('https://eu.i.posthog.com'), true);
  assert.equal(isPostHogIngestionHost('https://eu.i.posthog.com/'), true);
  assert.equal(isPostHogIngestionHost(undefined), false);
  assert.equal(isPostHogIngestionHost('https://us.i.posthog.com'), false);
  assert.equal(isPostHogCliHost('https://eu.posthog.com'), true);
  assert.equal(isPostHogCliHost('https://us.posthog.com'), false);
  const eu = {
    POSTHOG_CLI_API_KEY: 'phx_personal',
    POSTHOG_CLI_PROJECT_ID: '42',
    EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_project',
    EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    POSTHOG_CLI_HOST: 'https://eu.posthog.com',
  };
  assert.equal(assertUploadHost(eu).ok, true);
  assert.equal(assertUploadHost({ ...eu, POSTHOG_CLI_HOST: 'https://us.posthog.com' }).ok, false);
  assert.equal(assertUploadHost({ ...eu, EXPO_PUBLIC_POSTHOG_HOST: '' }).ok, false);
});

test('프로브는 개발 빌드와 명시 변수가 함께 있을 때만 열린다', () => {
  const previousDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  const previousProbe = process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE = '1';
  assert.equal(errorTrackingProbeAllowed(), false);
  assert.throws(() => runHandledErrorProbe(), /not available/);
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  delete process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE;
  assert.equal(errorTrackingProbeAllowed(), false);
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE = '1';
  const captured: string[] = [];
  attachErrorTrackingRuntime({
    captureException() { captured.push('sent'); },
    getReleaseContext: release,
  });
  runHandledErrorProbe();
  assert.deepEqual(captured, ['sent']);
  attachErrorTrackingRuntime(null);
  if (previousProbe === undefined) delete process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE;
  else process.env.EXPO_PUBLIC_ERROR_TRACKING_PROBE = previousProbe;
  (globalThis as { __DEV__?: boolean }).__DEV__ = previousDev;
});

test('업로드 자격은 personal key만 받고 프로젝트 키 재사용과 PR 실행을 거절한다', () => {
  assert.equal(assertUploadCredentials({}).ok, false);
  assert.equal(assertUploadCredentials({
    POSTHOG_CLI_API_KEY: 'phc_project',
    POSTHOG_CLI_PROJECT_ID: '42',
  }).ok, false);
  assert.equal(assertUploadCredentials({
    POSTHOG_CLI_API_KEY: 'phc_same',
    POSTHOG_CLI_PROJECT_ID: '42',
    EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_same',
  }).ok, false);
  assert.equal(assertUploadCredentials({
    POSTHOG_CLI_API_KEY: 'phx_personal',
    POSTHOG_CLI_PROJECT_ID: '42',
    EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_project',
  }).ok, true);
  const noProbe = {} as unknown as NodeJS.ProcessEnv;
  const probeOn = { EXPO_PUBLIC_ERROR_TRACKING_PROBE: '1' } as unknown as NodeJS.ProcessEnv;
  assert.equal(probeConfigPlugins(noProbe).length, 0);
  assert.match(probeHostModule('/repo', noProbe), /errorTrackingProbeHost\.tsx$/);
  assert.match(probeHostModule('/repo', probeOn), /errorTrackingProbeHost\.verify\.tsx$/);
  const releaseHost = readFileSync(new URL('../lib/errorTrackingProbeHost.tsx', import.meta.url), 'utf8');
  assert.equal(releaseHost.includes('triggerNativeCrash'), false);
  assert.equal(releaseHost.includes('throw '), false);
  assert.match(uploadBlockedReason({ GITHUB_EVENT_NAME: 'pull_request' }) ?? '', /pull_request/);
  assert.match(uploadBlockedReason({ GITHUB_EVENT_NAME: 'push' }) ?? '', /push/);
  assert.equal(uploadBlockedReason({ GITHUB_EVENT_NAME: 'workflow_dispatch' }), null);
  assert.equal(resolveUploadDirectory('/tmp/dist'), null);
  assert.equal(resolveUploadDirectory('../dist'), null);
  assert.ok(resolveUploadDirectory('dist'));
});

test('플러그인·메트로·수동 업로드 설정은 네이티브 빌드를 시작하지 않는다', () => {
  const plugin = JSON.parse(readFileSync(new URL('../config/posthog-error-tracking.json', import.meta.url), 'utf8'));
  assert.equal(plugin.uploadNativeSymbols, true);
  assert.equal(plugin.includeSource, false);
  assert.equal(plugin.skipOnConflict, true);
  assert.equal(plugin.releaseMode, 'event');
  assert.equal(plugin.ingestionHost, 'https://eu.i.posthog.com');
  assert.equal(plugin.cliHost, 'https://eu.posthog.com');
  const appConfig = readFileSync(new URL('../app.config.js', import.meta.url), 'utf8');
  assert.match(appConfig, /posthog-react-native\/expo/);
  assert.equal(appConfig.includes('dotenvFile'), false);
  assert.equal(appConfig.includes('phx_'), false);
  const metro = readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8');
  assert.match(metro, /unstableBeforeAssetSerializationDebugIdPlugin/);
  assert.match(metro, /getSentryExpoConfig/);
  const workflow = readFileSync(new URL('../.github/workflows/posthog-symbols.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes('pull_request:'), false);
  assert.equal(workflow.includes('eas build'), false);
  assert.equal(workflow.includes('eas update'), false);
  assert.match(workflow, /secrets\.POSTHOG_CLI_API_KEY/);
  assert.match(workflow, /EXPO_PUBLIC_POSTHOG_HOST: https:\/\/eu\.i\.posthog\.com/);
  assert.match(workflow, /POSTHOG_CLI_HOST: https:\/\/eu\.posthog\.com/);
  const checks = readFileSync(new URL('../.github/workflows/checks.yml', import.meta.url), 'utf8');
  assert.equal(checks.includes('upload-posthog-hermes'), false);
  assert.equal(checks.includes('eas build'), false);
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  assert.match(scripts['eas-build-post-install'], /@posthog\/cli@0\.19\.0/);
  assert.match(scripts['posthog:upload-hermes'], /upload-posthog-hermes\.mjs/);
});
