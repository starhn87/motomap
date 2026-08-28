export const JWT_FUTURE_RETRY_DELAYS_MS = [1000, 3000] as const;

export function isJwtIssuedAtFutureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const structured = error as Record<string, unknown>;
  return (
    structured.code === 'PGRST303' &&
    typeof structured.message === 'string' &&
    structured.message.toLowerCase().includes('jwt issued at future')
  );
}
