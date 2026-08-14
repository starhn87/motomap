import { supabase } from '@/lib/supabase';

// AI 추천 챗(Edge Function moto-chat) 클라이언트

export interface ChatPlaceCard {
  id: string;
  name: string;
  category: string;
  address: string;
  distanceKm: number | null;
}

export interface ChatCourseCard {
  id: string;
  name: string;
  distance: number;
  duration: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  places: ChatPlaceCard[];
  courses: ChatCourseCard[];
}

export async function sendChat(
  messages: ChatTurn[],
  location?: { latitude: number; longitude: number } | null,
  bike?: string | null,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('moto-chat', {
    // 서버도 다시 검증하지만, 오래 대화해도 불필요한 이전 턴을 전송하지 않는다.
    body: {
      messages: messages.slice(-10),
      location: location ?? undefined,
      bike: bike ?? undefined,
    },
  });
  if (error) throw new Error(`추천을 불러오지 못했습니다: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as ChatResponse;
}
