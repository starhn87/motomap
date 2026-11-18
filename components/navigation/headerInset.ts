import { createContext, useContext } from 'react';

// 탭의 겹치는 헤더와 활동 분류만큼 첫 행을 비운다. 독립 목록 화면은 0이다.
export const HeaderInsetContext = createContext(0);
export const useContentHeaderInset = () => useContext(HeaderInsetContext);
