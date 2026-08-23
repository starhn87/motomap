import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const policy = JSON.parse(read('config/release-policy.json'));
const notes = JSON.parse(read('config/release-notes.json'));
const pkg = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const errors = [];
const versionPattern = /^\d+\.\d+\.\d+$/;

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

for (const key of ['appVersion', 'supportedPreviousVersion', 'minimumSupportedVersion']) {
  if (!versionPattern.test(policy[key])) errors.push(`${key}가 x.y.z 형식이 아닙니다.`);
}
if (pkg.version !== policy.appVersion) {
  errors.push(`package.json(${pkg.version})과 release-policy(${policy.appVersion}) 버전이 다릅니다.`);
}
if (
  packageLock.version !== policy.appVersion ||
  packageLock.packages?.['']?.version !== policy.appVersion
) {
  errors.push(`package-lock.json과 release-policy(${policy.appVersion}) 버전이 다릅니다.`);
}
if (compareVersions(policy.supportedPreviousVersion, policy.appVersion) >= 0) {
  errors.push('supportedPreviousVersion은 현재 앱 버전보다 낮아야 합니다.');
}
if (compareVersions(policy.minimumSupportedVersion, policy.supportedPreviousVersion) > 0) {
  errors.push('minimumSupportedVersion은 공식 지원 직전 버전보다 높을 수 없습니다.');
}
if (!notes[policy.appVersion]) {
  errors.push(`config/release-notes.json에 ${policy.appVersion} 릴리즈 노트가 없습니다.`);
}

const appConfig = read('app.config.js');
if (!appConfig.includes('version: releasePolicy.appVersion')) {
  errors.push('app.config.js 버전은 release-policy.appVersion을 사용해야 합니다.');
}
if (!/runtimeVersion:\s*\{\s*policy:\s*['"]appVersion['"]/.test(appConfig)) {
  errors.push("runtimeVersion 정책은 'appVersion'이어야 합니다.");
}

const nativeModule = read('modules/kakao-navi/ios/KakaoNaviModule.swift');
const nativeVersion = Number(nativeModule.match(/"bridgeVersion":\s*(\d+)/)?.[1]);
if (nativeVersion !== policy.nativeBridgeVersion) {
  errors.push(
    `Swift bridgeVersion(${nativeVersion})과 release-policy(${policy.nativeBridgeVersion})가 다릅니다.`,
  );
}

const compatibilityDoc = read('docs/domain-decisions/release-compatibility.md');
for (const marker of [
  `현재 앱 버전: **${policy.appVersion}**`,
  `공식 지원 직전 버전: **${policy.supportedPreviousVersion}**`,
  `원격 최소 실행 버전: **${policy.minimumSupportedVersion}**`,
  `네이티브 브리지 계약: **${policy.nativeBridgeVersion}**`,
  `백엔드 API 계약: **${policy.apiContractVersion}**`,
]) {
  if (!compatibilityDoc.includes(marker)) errors.push(`호환성 문서 동기화 누락: ${marker}`);
}

for (const path of [
  'docs/app-store-listing.md',
  'docs/app-store-submission.md',
  'docs/submission-checklist.md',
]) {
  if (!read(path).includes(policy.appVersion)) {
    errors.push(`${path}에 현재 앱 버전 ${policy.appVersion}이 없습니다.`);
  }
}

// 네이티브 경계가 바뀌었는데 앱·브리지 계약을 그대로 두는 실수를 PR과 main
// push에서 막는다. 첫 도입처럼 기준 커밋에 정책 파일이 없으면 정합성 검사만 한다.
const baseSha = process.env.BASE_SHA;
if (baseSha && !/^0+$/.test(baseSha)) {
  try {
    const basePolicy = JSON.parse(
      execFileSync('git', ['show', `${baseSha}:config/release-policy.json`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    const changed = execFileSync('git', ['diff', '--name-only', baseSha, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    const nativeChanged = changed.some((path) =>
      /^(modules\/[^/]+\/(ios|android)\/|plugins\/|patches\/|app\.config\.js$|eas\.json$)/.test(
        path,
      ),
    );
    const bridgeChanged = changed.some((path) =>
      /^modules\/[^/]+\/(ios|android)\//.test(path),
    );
    if (nativeChanged && basePolicy.appVersion === policy.appVersion) {
      errors.push('네이티브 경계가 바뀌었지만 appVersion이 올라가지 않았습니다.');
    }
    if (bridgeChanged && basePolicy.nativeBridgeVersion === policy.nativeBridgeVersion) {
      errors.push('네이티브 모듈이 바뀌었지만 nativeBridgeVersion이 올라가지 않았습니다.');
    }
  } catch {
    // 기준 커밋에 정책 파일이 없는 첫 도입 또는 shallow checkout은 건너뛴다.
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(
  `release compatibility ok: app ${policy.appVersion}, native ${policy.nativeBridgeVersion}, api ${policy.apiContractVersion}`,
);
