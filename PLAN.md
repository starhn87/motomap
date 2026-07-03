# RideMap 구현 계획

바이커 전용 지도/네비게이션 앱

## 기술 스택

- **Mobile**: React Native (Expo) + TypeScript
- **지도**: 네이버지도 SDK (@mj-studio/react-native-naver-map)
- **경로**: 네이버 Directions 5 API
- **백엔드**: Supabase (PostgreSQL + PostGIS, Auth, Storage, Realtime)
- **상태관리**: Zustand + TanStack Query
- **UI/UX**: Reanimated, Gesture Handler, Bottom Sheet
- **CI/CD**: EAS Build + EAS Update (OTA), GitHub Actions

> 코드 레벨 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조.

## MVP (v1.0)

- [x] 지도 뷰 + 바이커 POI 표시 (네이버지도)
- [x] 카테고리 필터 (카페, 맛집, 휴게소, 주유소, 정비소, 뷰포인트, 용품점)
- [x] 장소 상세 (바텀시트)
- [x] Supabase 연동 (DB + PostGIS)
- [x] 소셜 로그인 UI (카카오, 네이버, 구글, 애플)
- [x] 장소 제보 (크라우드소싱: 제보 → 검증 → 반영)
- [x] 네비게이션 (외부 네비앱 딥링크: 카카오맵, T맵, 네이버지도, Apple 지도)
- [x] 내 위치 실시간 추적 + 방향 표시

## v1.1

- [x] 장소 리뷰/평점
- [x] 즐겨찾기 (장소 저장, 프로필에서 확인)
- [x] 라이딩 추천 코스 목록 + 미리보기

## 런칭 전 필수

- [ ] 소셜 로그인 실제 연동 (각 플랫폼 개발자 콘솔 설정)
  - Supabase Authentication > Providers에서 각 provider 활성화
  - 카카오: developers.kakao.com → REST API 키
  - 네이버: developers.naver.com → 클라이언트 ID/Secret
  - 구글: console.cloud.google.com → OAuth 2.0 클라이언트 ID/Secret
  - 애플: developer.apple.com → Services ID + Secret Key
- [ ] 네이버 Directions API 활성화 확인 (현재 Permission Denied)
- [ ] 경로 미리보기 동작 확인

## v1.2+

- [ ] 코스 공유·편집 (사용자가 만든 코스 공유)
- [ ] 실시간 정보 (도로 상태, 날씨, 단속 카메라)
- [ ] 커뮤니티 (모임 모집, 피드)
- [ ] 마커 클러스터링 (데이터 증가 시 적용)

## 디자인

- 다크모드(야간모드) 지원
- 브랜드 컬러: 오렌지 (#F97316)
- 라이딩 중 눈이 편한 UI

## 크라우드소싱 전략

1. **Phase 1 (런칭 초기)**: 시드 데이터 직접 등록 + 유저 제보 (수동 검증)
2. **Phase 2 (유저 확보 후)**: 신뢰 유저에게 검증자 권한 부여, N명 추천 시 자동 승인
3. **Phase 3 (스케일)**: 사진 + 위치 기반 중복 자동 감지, 리뷰/방문 수 기반 품질 관리

## 타겟

- 1차: 바이커 (오토바이)
- 2차: 자전거 라이더 (추후 확장)
