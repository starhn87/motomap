# 모토맵 구현 계획

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

- [ ] 소셜 로그인 실기기 검증 ([상세 설정](docs/social-auth-setup.md))
  - [x] 공통 앱 콜백 허용 및 수동 계정 연결 활성화
  - [x] Apple: 네이티브 ID Token 방식과 iOS capability·Supabase 공급자 설정
  - [x] 카카오: Supabase 자격 증명 저장·공급자 활성화
  - [x] 카카오: 개발자 콘솔 카카오 로그인·OpenID Connect 활성화
  - [x] 네이버: 로그인 애플리케이션과 `custom:naver` 공급자 설정
  - [x] Google: 웹 OAuth 클라이언트 발급 후 Supabase 공급자 활성화
  - [ ] 1.2.6 TestFlight에서 네 공급자 신규 가입·재로그인·취소 확인
  - [ ] 기존 이메일 계정에 네 공급자를 연결해 사용자 ID·기존 데이터 유지 확인
- [ ] 1.2.6 TestFlight에서 경로 미리보기·실제 길안내 회귀 확인

## v1.2+

- [x] 라이더 장소 정보 — 주차·진입로·단체 방문·헬멧 보관·야간·화장실 빠른 확인
- [x] 내 바이크 목적지 추천 — 동일 기종 우선, 동일 유형 보완, 검색 필터 연동
- [ ] 코스 공유·편집 (사용자가 만든 코스 공유)
- [ ] 실시간 정보 (도로 상태, 날씨, 단속 카메라)
- [ ] 커뮤니티 (모임 모집, 피드)
- [ ] 마커 클러스터링 (데이터 증가 시 적용)
- [ ] 큰글자 모드 — **인앱 토글**(시스템 설정과 별개, 사용자 의도). RN 0.81은 전역 Text 패치 불가라 모든 Text를 공용 컴포넌트로 감싸는 전면 리팩토링 필요(반나절~하루). 앱은 이미 시스템 글자 크기(allowFontScaling)는 따르는 상태

## 다음 네이티브 빌드 백로그

OTA·DB 배포로 해결할 수 없는 항목만 모은다. 개별 기능 하나 때문에 심사를 다시
올리지 않고, 실제 주행 기록을 중심으로 한 다음 버전에 함께 묶는다.

- [ ] **Ride Recap** — 백그라운드 GPS로 실제 경로·거리·시간·속도·고도를 기록하고 중단 후 복구
  - `expo-task-manager` 등 백그라운드 작업 모듈, 배터리·권한·위치정보 보관 정책 설계가 필요하다.
- [ ] **주행 중 전방 위험 음성·햅틱 알림** — KNSDK 안내 화면에서 경로 앞 위험을 네이티브로 전달
  - 기존 JS 위험 경고와 중복되지 않게 KNSDK 브리지·iOS·Android 양쪽 구현을 함께 설계한다.
- [ ] **위젯·Live Activity** — 출발 전 날씨·저장 코스, 주행 중 남은 거리·도착 예정 시각
  - Ride Recap과 반복 사용 지표가 검증된 뒤 확장한다.

## 1.2.6 네이티브 빌드 포함

- [x] Apple·카카오 네이티브 로그인과 네이버·Google 브라우저 로그인
- [x] SecureStore 기반 인증 세션 저장과 계정 연결
- [x] Universal Links — 장소·코스 HTTPS 링크와 미설치 시 App Store 폴백
- [x] 라이더 기록 공유 카드 이미지 내보내기
- [x] 햅틱 피드백과 사용자 설정 토글

## 운영·보안 백로그

- [ ] 네이버 Cloud Maps Client Secret 재발급 (낮은 우선순위)
  - 과거 `EXPO_PUBLIC_NAVER_CLIENT_SECRET`이 앱 번들에 포함돼 기존 값은 외부 추출 가능성이 있다.
  - 2026-08-14에 지오코딩은 Supabase Edge Function으로 이전했고 EAS 공개 변수도 삭제했다. 기능은 정상이며, 남은 위험은 기존 값으로 네이버 REST API를 직접 호출해 사용량·과금을 소진할 수 있다는 점이다.
  - 네이버 Cloud 콘솔에서 재발급한 뒤 Supabase `NAVER_CLOUD_CLIENT_SECRET`과 로컬 `.env`만 교체한다. 네이티브 빌드·OTA는 필요 없다.
  - 재발급 전까지 API 사용량 한도와 임계치 알림을 유지한다.

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
