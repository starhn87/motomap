// 도착 직전에는 거리 글자의 잦은 변경을 줄인다.
export function formatRemainingDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  if (meters === 0) return '0m';
  const step = meters <= 100 ? 5 : 20;
  return `${Math.max(step, Math.floor(meters / step) * step)}m`;
}
