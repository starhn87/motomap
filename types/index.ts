export type PlaceCategory =
  | 'cafe'
  | 'restaurant'
  | 'rest_stop'
  | 'gas_station'
  | 'repair_shop'
  | 'viewpoint'
  | 'gear_shop'
  | 'camping';

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
  openingHours?: string;
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
}
