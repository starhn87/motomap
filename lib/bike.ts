import { useQuery } from '@tanstack/react-query';

import type { FuelCode } from '@/lib/api/gasStations';

import { BIKE_SPECS, type BikeSpec } from '@/constants/bikes';
import { getProfile } from '@/lib/nickname';
import { useAuthStore } from '@/stores/useAuthStore';

/** 등록한 기종의 스펙. 자유 입력 기종이거나 스펙이 없는 기종이면 undefined. */
export function getBikeSpec(model: string | null | undefined): BikeSpec | undefined {
  if (!model) return undefined;
  return BIKE_SPECS[model.trim()];
}

/** 내 바이크가 넣는 유종 코드. 미등록·스펙 없음이면 null — 강조하지 않는다. */
export function myFuelProd(spec: BikeSpec | undefined): FuelCode | null {
  if (!spec?.fuelGrade) return null;
  return spec.fuelGrade === 'premium' ? 'B034' : 'B027';
}

/**
 * 가득 주유비(원). 탱크 용량과 해당 유종 가격이 둘 다 있어야 한다.
 * 잔량은 알 수 없으니 어디까지나 "빈 탱크 기준" — 표시 문구에 용량을 같이 쓴다.
 */
export function fullTankCost(
  spec: BikeSpec | undefined,
  prices: { prod: string; price: number }[],
): number | null {
  const prod = myFuelProd(spec);
  if (!prod || !spec?.tankL) return null;
  const row = prices.find((p) => p.prod === prod);
  if (!row) return null;
  // 100원 단위 반올림 — 리터 단가 × 소수 용량이라 1원 단위는 과한 정밀도다
  return Math.round((row.price * spec.tankL) / 100) * 100;
}

/**
 * 내 바이크 기종·스펙 — 유가 강조·가득 주유비 계산이 쓴다.
 * 기종은 바뀌는 일이 드물어서 세션 동안 캐시로 충분하다.
 */
export function useMyBike() {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({
    queryKey: ['my-bike', user?.id],
    queryFn: async () => (await getProfile())?.bike_model ?? null,
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });
  const model = data ?? null;
  return { model, spec: getBikeSpec(model) };
}
