import type { Hours } from '@/lib/hours';

export type PlaceCategory =
  | 'cafe'
  | 'restaurant'
  | 'rest_stop'
  | 'gas_station'
  | 'repair_shop'
  | 'viewpoint'
  | 'gear_shop'
  | 'camping'
  | 'car_wash';

export interface Place {
  id: string;
  name: string;
  description: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  address: string;
  phone?: string;
  photos: string[];
  rating: number;
  reviewCount: number;
  tags: string[];
  /** 사람이 쓴 원문 — 구조화가 못 담는 뉘앙스가 여기 있다 */
  openingHours?: string;
  /** 구조화된 영업시간. 있으면 "지금 영업중"을 계산한다 */
  hours?: Hours;
  parkingInfo?: string;
  submittedBy: string;
  approved: boolean;
  createdAt: string;
}

export interface RidingCourse {
  id: string;
  name: string;
  description: string;
  distance: number; // km
  duration: number; // minutes
  coordinates: [number, number][];
  /** 구간 표기 — "어디서 어디까지, 무슨 길" (구모델 데이터는 null) */
  sectionFrom: string | null;
  sectionTo: string | null;
  routeName: string | null;
  /** 표시용 단순화 경로 [lng, lat][] — 실도로 스냅을 단순화한 것 (구데이터는 null) */
  routeGeometry: [number, number][] | null;
  waypoints: Place[];
  tags: string[];
  createdBy: string;
  rating: number;
  reviewCount: number;
  createdAt: string;
}

export interface Review {
  id: string;
  placeId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  bikeModel: string | null;
  rating: number;
  content: string;
  photos: string[];
  createdAt: string;
  likeCount: number;
  /** 내가 좋아요를 눌렀는지 (RLS 상 본인 행만 조회되는 점을 이용) */
  likedByMe: boolean;
}

export type HazardType =
  | 'sand'
  | 'oil'
  | 'pothole'
  | 'rockfall'
  | 'ice'
  | 'construction'
  | 'etc';

export interface RoadHazard {
  id: string;
  type: HazardType;
  note: string | null;
  photo: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  lastConfirmedAt: string;
  confirmCount: number;
  resolvedCount: number;
  /** 0 신선 / 1 수명을 넘겨 흐리게 표시 */
  staleness: number;
}
