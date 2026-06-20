export type PlaceCategory =
  | 'cafe'
  | 'restaurant'
  | 'rest_stop'
  | 'gas_station'
  | 'repair_shop'
  | 'viewpoint'
  | 'gear_shop';

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
  waypoints: Place[];
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
  rating: number;
  content: string;
  photos: string[];
  createdAt: string;
}

export interface Ride {
  id: string;
  userId: string;
  title: string;
  coordinates: [number, number][]; // [lng, lat]
  distance: number; // km
  duration: number; // 초
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}
