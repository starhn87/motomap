export type PlaceCategory =
  | 'cafe'
  | 'restaurant'
  | 'rest_stop'
  | 'gas_station'
  | 'repair_shop'
  | 'viewpoint';

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
  difficulty: 'easy' | 'medium' | 'hard';
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
