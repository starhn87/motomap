import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = JSON.parse(readFileSync(new URL('../config/posthog-error-tracking.json', import.meta.url), 'utf8'));

export const POSTHOG_CLI_SPEC = '@posthog/cli@0.19.0';

const BLOCKED_GITHUB_EVENTS = new Set(['pull_request', 'pull_request_target', 'push']);

export function uploadBlockedReason(env) {
  const event = env.GITHUB_EVENT_NAME;
  if (event && BLOCKED_GITHUB_EVENTS.has(event)) {
    return `Refusing PostHog upload for GitHub event ${event}.`;
  }
  return null;
}

export function assertUploadCredentials(env) {
  const key = env.POSTHOG_CLI_API_KEY ?? '';
  const projectId = env.POSTHOG_CLI_PROJECT_ID ?? '';
  const analyticsKey = env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
  if (!key || !projectId) {
    return { ok: false, reason: 'POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID are required.' };
  }
  if (key.startsWith('phc_') || (analyticsKey && key === analyticsKey)) {
    return { ok: false, reason: 'The analytics project key cannot be used as the upload credential.' };
  }
  if (!key.startsWith('phx_')) {
    return { ok: false, reason: 'POSTHOG_CLI_API_KEY must be a personal API key.' };
  }
  if (!/^\d+$/.test(projectId)) {
    return { ok: false, reason: 'POSTHOG_CLI_PROJECT_ID must be a numeric project id.' };
  }
  return { ok: true };
}

export function assertUploadHost(env, expected = project) {
  const ingestion = (env.EXPO_PUBLIC_POSTHOG_HOST ?? '').trim().replace(/\/$/, '');
  const cli = (env.POSTHOG_CLI_HOST ?? '').trim().replace(/\/$/, '');
  if (!ingestion || !cli) {
    return { ok: false, reason: 'EXPO_PUBLIC_POSTHOG_HOST and POSTHOG_CLI_HOST are required.' };
  }
  if (ingestion !== expected.ingestionHost || cli !== expected.cliHost) {
    return { ok: false, reason: 'PostHog host does not match the configured project. Refusing upload.' };
  }
  return { ok: true };
}

function redactCliOutput(text) {
  return text
    .replace(/phx_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/phc_[A-Za-z0-9_-]+/g, '[redacted]');
}

export function resolveUploadDirectory(directory) {
  if (typeof directory !== 'string' || directory.length === 0 || directory.includes('\0')) return null;
  if (directory.startsWith('/') || directory.includes('..')) return null;
  return resolve(directory);
}

export function uploadHermesSourceMaps(directory, env = process.env) {
  const blocked = uploadBlockedReason(env);
  if (blocked) return { ok: false, reason: blocked };
  const credentials = assertUploadCredentials(env);
  if (!credentials.ok) return credentials;
  const hosts = assertUploadHost(env);
  if (!hosts.ok) return hosts;
  const root = resolveUploadDirectory(directory);
  if (!root) return { ok: false, reason: 'Hermes source map directory must stay inside the workspace.' };
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { ok: false, reason: 'Hermes source map directory was not found.' };
  }
  const childEnv = { ...env };
  const result = spawnSync(
    'npx',
    ['--yes', POSTHOG_CLI_SPEC, 'hermes', 'upload', '--directory', root, '--release-mode', 'event'],
    { env: childEnv, encoding: 'utf8' },
  );
  const output = redactCliOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (output) process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
  if (result.error) return { ok: false, reason: 'posthog-cli could not be started.' };
  if (result.status !== 0) return { ok: false, reason: `posthog-cli exited ${result.status}.` };
  return { ok: true };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const directory = process.argv[2] ?? 'dist';
  const outcome = uploadHermesSourceMaps(directory);
  if (!outcome.ok) {
    process.stderr.write(`${outcome.reason}\n`);
    process.exit(1);
  }
}
