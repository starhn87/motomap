import project from '@/config/posthog-error-tracking.json';

/** 주간 다이제스트가 기록한 기존 PostHog 프로젝트. 다른 클라우드로 추정해 보내지 않는다. */
export const POSTHOG_INGESTION_HOST = project.ingestionHost;
export const POSTHOG_CLI_HOST = project.cliHost;

export function normalizePostHogHost(host: string | undefined): string {
  return (host ?? '').trim().replace(/\/$/, '');
}

export function isPostHogIngestionHost(host: string | undefined): boolean {
  return normalizePostHogHost(host) === POSTHOG_INGESTION_HOST;
}

export function isPostHogCliHost(host: string | undefined): boolean {
  return normalizePostHogHost(host) === POSTHOG_CLI_HOST;
}

/** 공식 autocapture 플래그는 플랫폼을 나누지 않는다. Android 프로세스에서는 끄고 iOS만 켠다. */
export function nativeCrashAutocaptureForPlatform(os: string): boolean {
  return os === 'ios';
}
