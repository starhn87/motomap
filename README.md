# RideMap

바이커(오토바이 라이더) 전용 지도·커뮤니티 앱.
라이딩 맛집·카페·뷰포인트·주유소·정비소를 지도 위에서 찾고, 리뷰·평점·코스 공유로 라이더끼리 정보를 나눈다.

## 주요 기능

- **지도 + POI** — 네이버지도 기반 바이커 장소 탐색 (카페, 맛집, 휴게소, 주유소, 정비소, 뷰포인트)
- **장소 제보** — 크라우드소싱으로 장소 추가 (사진 포함)
- **리뷰·평점** — 장소/코스 리뷰, 사진 첨부, 수정
- **라이딩 코스** — 추천 코스 목록 + 상세
- **외부 네비 연동** — 카카오내비(이륜차), T맵, 네이버지도, Apple 지도 딥링크
- **커뮤니티 위생** — 신고/차단, 회원 탈퇴

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 앱 | React Native 0.81 / Expo SDK 54 / TypeScript |
| 라우팅 | expo-router (typed routes) |
| 지도 | @mj-studio/react-native-naver-map |
| 인증·DB·스토리지 | Supabase (Postgres + PostGIS + RLS) |
| 상태/데이터 | Zustand, @tanstack/react-query |
| 소셜 | @react-native-kakao/core, navi |
| 배포 | EAS Build + Submit |

## 프로젝트 구조

```
app/                expo-router 파일 기반 라우팅
  (tabs)/           탭 네비게이션 (index, courses, submit, profile)
  course/[id].tsx   코스 상세
  legal/[type].tsx  약관·정책 뷰어
  settings.tsx      설정
components/         재사용 UI
lib/                Supabase 클라이언트·API 래퍼·유틸
  api/              reports, blocks, courses, reviews, ...
hooks/              useBlocks 등 React Query 훅
stores/             Zustand 스토어 (auth, theme, navPref)
constants/          Colors, legal 문서
supabase/migrations/  스키마 마이그레이션
```

## 개발 환경 설정

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수
cp .env.example .env
# .env 에 Supabase / 네이버 / 카카오 키 입력

# 3. Supabase 마이그레이션 실행
# Supabase 대시보드 > SQL Editor 에서 supabase/migrations/*.sql 순서대로 실행

# 4. iOS 또는 Android 실행
npm run ios
npm run android
```

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `NAVER_MAP_CLIENT_ID` | 네이버지도 SDK 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_ID` | 네이버 Directions API 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_SECRET` | 네이버 Directions API 시크릿 |
| `KAKAO_NATIVE_APP_KEY` | 카카오 네이티브 앱 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 시드 스크립트 전용 (선택) |

## 빌드 & 배포 (EAS)

```bash
# 최초 1회
npx eas login

# 빌드
npx eas build --profile preview --platform ios        # 내부 테스트
npx eas build --profile production --platform all     # 스토어 제출용

# 스토어 제출
npx eas submit --platform ios
npx eas submit --platform android
```

## 라이선스

사용자 런칭 전까지는 소스 공개 없이 비공개 저장소로 운영.
