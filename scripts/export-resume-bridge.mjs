import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stage = resolve(process.argv[2] ?? '');
const runtime = process.argv[3];
if (!/\/motomap-resume-(legacy|notify54|patch36|patch37)-[^/]+$/.test(stage)) {
  throw new Error('prepare-resume-bridge로 만든 임시 폴더만 허용합니다.');
}
const source = JSON.parse(readFileSync(join(stage, 'bridge-source.json'), 'utf8'));
if (!source.runtimes.includes(runtime)) throw new Error('그룹과 runtime 불일치');
const sdk = JSON.parse(readFileSync(join(stage, 'node_modules/expo/package.json'), 'utf8')).version;
const rn = JSON.parse(readFileSync(join(stage, 'node_modules/react-native/package.json'), 'utf8')).version;
if (sdk !== source.sdk || !sdk.startsWith('54.') || rn !== '0.81.5') throw new Error('SDK54/RN0.81.5 계약 불일치');
copyFileSync(join(root, 'scripts/resume-bridge/App.tsx'), join(stage, 'App.tsx'));
copyFileSync(join(root, 'lib/serviceResumeNotification.ts'), join(stage, 'serviceResumeNotification.ts'));
copyFileSync(join(root, 'lib/foregroundLink.ts'), join(stage, 'foregroundLink.ts'));
const adapter = source.group === 'legacy'
  ? "export function setupResumeStoreLink() { return { dispose() {}, settleStartup: async () => 'none' as const }; }\n"
  : readFileSync(join(root, 'scripts/resume-bridge/notificationAdapter.ts'), 'utf8')
      .replace('../../lib/serviceResumeNotification', './serviceResumeNotification')
      .replace('../../lib/foregroundLink', './foregroundLink');
writeFileSync(join(stage, 'notificationAdapter.ts'), adapter);
const output = `dist-${runtime}`;
const result = spawnSync(join(stage, 'node_modules/.bin/expo'), [
  'export', '--platform', 'ios', '--source-maps', '--output-dir', output,
], { cwd: stage, stdio: 'inherit', env: { ...process.env, EXPO_NO_DOTENV: '1', MOTOMAP_BRIDGE_RUNTIME: runtime } });
if (result.status !== 0) process.exit(result.status ?? 1);
const directory = join(stage, output, '_expo/static/js/ios');
const mapName = readdirSync(directory).find((name) => name.endsWith('.hbc.map'));
if (!mapName) throw new Error('Hermes iOS source map 없음');
const map = JSON.parse(readFileSync(join(directory, mapName), 'utf8'));
const forbidden = /(?:@supabase\/|expo-location\/|react-native-naver-map\/|posthog-react-native\/|@sentry\/react-native\/|modules\/kakao-navi\/|stores\/useAuthStore)/;
if (map.sources.some((name) => forbidden.test(name))) throw new Error('연결 번들에 서비스 모듈이 포함됐습니다.');
if (source.group === 'legacy' && map.sources.some((name) => /expo-notifications\//.test(name))) {
  throw new Error('초기 runtime에 알림 native module import가 포함됐습니다.');
}
console.log(`verified connection-only export: runtime ${runtime}, SDK ${sdk}, RN ${rn}, ${map.sources.length} modules`);
