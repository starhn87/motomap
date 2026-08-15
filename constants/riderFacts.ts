export type RiderFactCode =
  | 'easy_parking'
  | 'rough_approach'
  | 'group_friendly'
  | 'helmet_storage'
  | 'night_friendly'
  | 'restroom';

export const RIDER_FACTS = [
  { code: 'easy_parking', label: '바이크 주차 편해요', icon: 'bicycle-outline' },
  { code: 'rough_approach', label: '진입로 노면 주의', icon: 'warning-outline' },
  { code: 'group_friendly', label: '여럿이 가기 좋아요', icon: 'people-outline' },
  { code: 'helmet_storage', label: '헬멧 보관 가능해요', icon: 'shield-checkmark-outline' },
  { code: 'night_friendly', label: '밤에도 가기 좋아요', icon: 'moon-outline' },
  { code: 'restroom', label: '화장실 이용 가능해요', icon: 'water-outline' },
] as const satisfies readonly {
  code: RiderFactCode;
  label: string;
  icon: string;
}[];
