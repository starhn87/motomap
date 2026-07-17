# 🏍️ 모토맵

> 오토바이 라이더를 위한 지도 앱

[![Download on the App Store](https://img.shields.io/badge/Download_on_the-App_Store-0D96F6?style=flat-square&logo=apple&logoColor=white)](https://apps.apple.com/app/id6773636183)
![Platform](https://img.shields.io/badge/platform-iOS-lightgrey?style=flat-square)
![Expo SDK](https://img.shields.io/badge/Expo_SDK-54-000020?style=flat-square&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=black)

라이딩 갈 만한 카페, 맛집, 뷰포인트부터 주유소와 정비소 등을 지도에서 찾고 리뷰와 코스로 라이더끼리 정보를 나누는 앱입니다. 출발 전에는 기상청 예보 기반 라이딩 날씨로 비 소식을 확인할 수 있고, App Store에서 다운로드할 수 있습니다.

## 📱 스크린샷

| 지도 | 라이딩 날씨 | 일반 장소 |
|:---:|:---:|:---:|
| <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/01-map.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/02-weather.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/03-any-place.png" width="240"/> |
| **장소 상세** | **검색** | **코스 탐색** |
| <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/04-place-detail.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/05-search.png" width="240"/> | <img src="https://raw.githubusercontent.com/starhn87/motomap/main/docs/screenshots/06-explore.png" width="240"/> |

## ✨ 주요 기능

- 🗺️ **지도 + POI**: 네이버지도 기반 바이커 장소 탐색 (카페, 맛집, 휴게소, 주유소, 정비소, 뷰포인트, 용품점, 캠핑)
- 📍 **일반 장소**: 지도의 가게 아이콘이나 이름을 탭하면 등록되지 않은 곳도 바로 카드가 뜨고 길안내와 제보로 이어집니다
- 🔎 **통합 검색**: 등록 장소와 코스에 더해 일반 장소까지 검색해 길안내합니다. 집과 회사를 저장해두면 원터치로 길안내합니다
- 🌦️ **라이딩 날씨**: 기상청 단기예보 기반 라이딩 점수와 시간대별 강수확률을 제공합니다. 길안내 전에 경로의 비 소식도 경고합니다
- ⛽ **실시간 유가**: 오피넷 연동으로 주변 주유소 가격과 최저가를 표시합니다
- 🙋 **장소 제보**: 크라우드소싱 장소 추가할 수 있습니다. (주소 검색, 사진 포함) AI가 먼저 심사하고 승인과 반려 결과는 푸시와 인앱 알림으로 받습니다
- ⭐ **리뷰와 평점**: 사진 스와이프, 수정과 삭제, 리뷰어 바이크 뱃지
- 🛣️ **라이딩 코스**: 추천 코스 목록, 지금이 제철 뱃지, 경로 미리보기
- 🤖 **AI 추천**: 대화로 라이딩 코스나 장소를 추천해주는 챗봇
- 🏍️ **내 바이크**: 기종 검색 자동완성 1,040종 ([moto-kr](https://github.com/starhn87/moto-kr) 오픈소스 API)
- 🧭 **외부 네비 연동**: 카카오내비(이륜차 모드), T맵, 네이버지도, Apple 지도 딥링크
- 🛡️ **커뮤니티**: 신고와 차단, 회원 탈퇴

## 🧰 기술 스택

| 영역 | 사용 |
| --- | --- |
| 앱 | React Native 0.81 / Expo SDK 54 / TypeScript |
| 라우팅 | expo-router (typed routes) |
| 지도 | @mj-studio/react-native-naver-map (+ 심벌 탭 패치, patch-package) |
| 위치 | expo-location (현재 위치 표시) |
| 검색과 지오코딩 | 카카오 로컬 API |
| 날씨 | 기상청 단기예보 (Supabase Edge Function 프록시) |
| 유가 | 오피넷 API (Supabase Edge Function 프록시) |
| AI | Anthropic Claude (제보 심사와 추천 챗) |
| 기종 데이터 | [moto-kr](https://github.com/starhn87/moto-kr) (KENCIS 인증 기반 오픈소스 API) |
| 푸시 | expo-notifications + Expo Push (승인, 반려, 답변 알림) |
| 백엔드 | Supabase (Postgres + PostGIS + RLS + Edge Functions) |
| 상태와 데이터 | Zustand, @tanstack/react-query |
| 소셜 | @react-native-kakao/core, navi |
| 모니터링 | Sentry |
| 배포 | EAS Build + Submit, expo-updates OTA |

## 📂 프로젝트 구조

```
app/                  expo-router 파일 기반 라우팅
  (tabs)/             탭 (index 지도, courses 탐색, submit 제보, profile 내 정보)
  course/[id].tsx     코스 상세
  search.tsx          통합 검색 (장소, 코스, 일반 장소, 내 장소)
  chat.tsx            AI 추천 챗
  notifications.tsx   알림 목록
  legal/[type].tsx    약관과 정책 뷰어
components/           재사용 UI (map, review, submit, auth, ...)
lib/                  Supabase 클라이언트, API 래퍼, 유틸
  api/                places, courses, reviews, weather, gasStations, kakaoLocal, ...
hooks/                React Query 훅 (usePlaces, useCourses, useNotifications, ...)
stores/               Zustand (auth, chat, map, myPlaces)
patches/              네이버맵 심벌 탭 네이티브 패치 (postinstall 자동 적용)
supabase/
  migrations/         스키마 마이그레이션 (001 ~ 021, SQL Editor에서 순서대로 실행)
  functions/          Edge Functions (judge-submission, weather-kr, gas-stations, moto-chat, ...)
```

> 🧭 **코드 레벨 아키텍처**(레이어, 데이터 흐름, 상태, DB 스키마)는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조.

## 🚀 개발 환경 설정

```bash
# 1. 의존성 설치 (postinstall이 patches/ 를 자동 적용)
npm install

# 2. 환경 변수
cp .env.example .env
# .env 에 Supabase / 네이버 / 카카오 키 입력

# 3. Supabase 마이그레이션 실행
# Supabase 대시보드 > SQL Editor 에서 supabase/migrations/*.sql 을 번호 순서대로 실행

# 4. 개발 빌드 실행 (네이티브 모듈이 있어 Expo Go 불가, dev client 필요)
npm run ios
npm run android
```

> ⚠️ 네이버 지도와 카카오 등 네이티브 모듈을 사용하므로 **Expo Go로는 실행되지 않습니다.** `npm run ios`/`android`(로컬 dev client) 또는 EAS development 빌드를 사용하세요.

## 🔑 환경 변수

| 변수 | 설명 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `NAVER_MAP_CLIENT_ID` | 네이버지도 SDK 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_ID` | 네이버 Directions API 클라이언트 ID |
| `EXPO_PUBLIC_NAVER_CLIENT_SECRET` | 네이버 Directions API 시크릿 |
| `KAKAO_NATIVE_APP_KEY` | 카카오 네이티브 앱 키 |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 카카오 로컬 REST 키 (장소 검색과 지오코딩) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN (선택) |
| `SUPABASE_SERVICE_ROLE_KEY` | 시드 스크립트 전용 (선택) |

> 로컬 EAS 명령(`eas build`/`submit`)은 `.env`를 자동 로드하지 않으므로, 클라우드 빌드용 키는 EAS 환경 변수에 등록되어 있습니다 (`eas env:list --environment production`). 날씨와 유가, AI 키는 앱이 아닌 Supabase Edge Function secrets에 있습니다.

## 📦 빌드 & 배포 (EAS)

```bash
# 최초 1회
npx eas login

# 빌드
npx eas build --profile development --platform ios     # dev client (실기기 디버깅)
npx eas build --profile production  --platform ios     # 스토어 / TestFlight 제출용

# 스토어 제출 (App Store Connect API Key 사용 → 보안 지연 없이 비인터랙티브)
npx eas submit --profile production --platform ios --latest

# JS만 바뀐 업데이트는 OTA로 배포
npx eas update --channel production --platform ios --message "..."
```

> ⚠️ 이미 App Store에 출시된 버전 위에 새 빌드를 올릴 때는 **`app.config.js`의 `version`을 반드시 상향**해야 합니다 (동일 버전은 `ITMS-90186` train closed 로 거부). 빌드 번호는 production 프로파일의 `autoIncrement`가 처리합니다.
