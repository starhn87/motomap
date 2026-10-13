import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// EAS 완료 production 바이너리의 source lock 기준. 새 Expo 57 의존성을 재사용하지 않는다.
const groups = {
  legacy: { ref: '20cc6b2', expo: '54.0.33', notifications: false, runtimes: ['1.1.0', '1.1.1'] },
  notify54: { ref: '635aac6', expo: '54.0.33', notifications: true, runtimes: ['1.1.2', '1.1.3', '1.2.0', '1.2.1'] },
  patch36: { ref: 'e556828', expo: '54.0.36', notifications: true, runtimes: ['1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6'] },
  patch37: { ref: '07db220', expo: '54.0.37', notifications: true, runtimes: ['1.2.7'] },
};
const groupName = process.argv[2];
if (!Object.hasOwn(groups, groupName)) throw new Error(`그룹 지정 필요: ${Object.keys(groups).join(', ')}`);
const group = groups[groupName];
const historical = (path) => execFileSync('git', ['show', `${group.ref}:${path}`], { cwd: root, encoding: 'utf8' });
const pkg = JSON.parse(historical('package.json'));
const lockText = historical('package-lock.json');
const lock = JSON.parse(lockText);
if (lock.packages['node_modules/expo'].version !== group.expo ||
    lock.packages['node_modules/react'].version !== '19.1.0' ||
    lock.packages['node_modules/react-native'].version !== '0.81.5' ||
    Boolean(lock.packages['node_modules/expo-notifications']) !== group.notifications) {
  throw new Error('기준 lock의 SDK·React·RN·알림 계약 불일치');
}

const stage = mkdtempSync(join(tmpdir(), `motomap-resume-${groupName}-`));
pkg.main = './resume-entry.js';
// 원본 의존성·lock은 그대로 사용하고 실행 entry만 독립 연결 화면으로 바꾼다.
writeFileSync(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(join(stage, 'package-lock.json'), lockText);
copyFileSync(join(root, 'scripts/resume-bridge/App.tsx'), join(stage, 'App.tsx'));
copyFileSync(join(root, 'lib/serviceResumeNotification.ts'), join(stage, 'serviceResumeNotification.ts'));
copyFileSync(join(root, 'lib/foregroundLink.ts'), join(stage, 'foregroundLink.ts'));
copyFileSync(join(root, 'assets/images/icon-v2.png'), join(stage, 'icon.png'));
const adapter = group.notifications
  ? readFileSync(join(root, 'scripts/resume-bridge/notificationAdapter.ts'), 'utf8')
      .replace('../../lib/serviceResumeNotification', './serviceResumeNotification')
      .replace('../../lib/foregroundLink', './foregroundLink')
  : "export function setupResumeStoreLink() { return { dispose() {}, settleStartup: async () => 'none' as const }; }\n";
writeFileSync(join(stage, 'notificationAdapter.ts'), adapter);
writeFileSync(join(stage, 'resume-entry.js'), "import { registerRootComponent } from 'expo';\nimport App from './App';\nregisterRootComponent(App);\n");
writeFileSync(join(stage, 'app.config.js'), `
const allowed = ${JSON.stringify(group.runtimes)};
const runtime = process.env.MOTOMAP_BRIDGE_RUNTIME;
if (!allowed.includes(runtime)) throw new Error('허용하지 않은 bridge runtime');
module.exports = { expo: {
  name: '모토맵', slug: 'ridemap', owner: 'ridemapper', version: runtime,
  runtimeVersion: runtime, platforms: ['ios'], scheme: 'ridemap', icon: './icon.png',
  updates: { url: 'https://u.expo.dev/46277971-d460-4e19-82eb-df05f18ff9f7' },
  ios: { bundleIdentifier: 'com.ridemap.app' },
  extra: { eas: { projectId: '46277971-d460-4e19-82eb-df05f18ff9f7' } }
} };
`);
writeFileSync(join(stage, 'eas.json'), JSON.stringify({ build: { production: { channel: 'production' } } }, null, 2) + '\n');
writeFileSync(join(stage, 'bridge-source.json'), JSON.stringify({
  group: groupName, sourceRef: group.ref, sdk: group.expo, runtimes: group.runtimes,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
}, null, 2) + '\n');
console.log(`bridge staging: ${stage}`);
const install = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: stage, stdio: 'inherit', env: { ...process.env, EXPO_NO_DOTENV: '1' },
});
if (install.status !== 0) process.exit(install.status ?? 1);
console.log(`bridge ready: ${stage}; runtimes ${group.runtimes.join(', ')}`);
