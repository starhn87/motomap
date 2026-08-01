import { useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { toast } from '@/lib/toast';

// 음성 검색 — 장갑을 낀 채로 타이핑하기 어려운 상황을 위한 입력 수단.
// 지도 탭의 검색바와 검색 화면이 함께 쓴다.
//
// 인식 이벤트는 화면이 아니라 모듈 단위로 오는데, /search 를 push 해도 지도 탭은
// 그 아래 살아 있다 → 가드가 없으면 한 번의 인식에 두 화면이 같이 반응한다.
// 내가 시작한 세션일 때만 처리한다.
export function useVoiceSearch(onResult: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false);
  const mine = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    if (mine.current) setListening(true);
  });
  useSpeechRecognitionEvent('end', () => {
    if (!mine.current) return;
    mine.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (!mine.current) return;
    const transcript = e.results[0]?.transcript ?? '';
    if (transcript) onResult(transcript, e.isFinal);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (!mine.current) return;
    mine.current = false;
    setListening(false);
    // 사용자가 멈췄거나 아무 말도 없었던 경우까지 알릴 필요는 없다
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    if (e.error === 'not-allowed') {
      toast.error('마이크·음성 인식 권한이 필요해요.');
      return;
    }
    // 인식기 자체가 없는 환경(시뮬레이터 등)과 일시적 실패를 구분한다
    if (e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      toast.error('이 기기에서는 음성 검색을 쓸 수 없어요.');
      return;
    }
    toast.error('음성을 알아듣지 못했어요. 다시 시도해 주세요.');
  });

  // 화면을 벗어날 때 마이크를 놓지 않으면 녹음이 남는다 — 남의 세션은 건드리지 않는다
  useEffect(() => {
    return () => {
      if (mine.current) ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const toggle = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      toast.error('설정에서 마이크·음성 인식 권한을 켜주세요.');
      return;
    }
    mine.current = true;
    // interimResults 로 말하는 중에도 인식 상태가 보인다
    ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: false });
  };

  return { listening, toggle };
}
