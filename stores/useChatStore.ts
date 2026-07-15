import { create } from 'zustand';

import type { ChatPlaceCard, ChatCourseCard } from '@/lib/api/chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  places?: ChatPlaceCard[];
  courses?: ChatCourseCard[];
  /** 최초 도착 시에만 점진 표시 — 재진입·재마운트 시 다시 타이핑되지 않게 완료 후 false */
  animate?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  append: (message: Omit<ChatMessage, 'id'>) => void;
  markAnimated: (id: string) => void;
  setSending: (v: boolean) => void;
  clear: () => void;
}

let seq = 0;

// AI 추천 챗 세션 — 화면을 나가거나 앱이 백그라운드에 가도 앱이 살아 있는 동안 유지된다.
// (영속 저장은 하지 않는다 — 프로세스가 종료되면 새 대화로 시작)
export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  sending: false,
  append: (message) =>
    set((s) => ({ messages: [...s.messages, { ...message, id: `m${++seq}` }] })),
  markAnimated: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, animate: false } : m)),
    })),
  setSending: (v) => set({ sending: v }),
  clear: () => set({ messages: [], sending: false }),
}));
