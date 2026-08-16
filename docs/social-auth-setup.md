# 소셜 로그인 설정

모토맵 1.2.6은 Apple·카카오·네이버·Google 로그인을 제공한다. 로그인 뒤
닉네임과 필수 약관을 확인하는 온보딩을 거치며, 기존 사용자는 설정 화면에서
다른 로그인 수단을 같은 계정에 연결할 수 있다.

## 공통 주소

- Supabase 공급자 콜백:
  `https://rpbifswrkjcjojaulvor.supabase.co/auth/v1/callback`
- 앱 콜백: `ridemap://auth/callback`
- 서비스 도메인: `https://motomap.kr`

Supabase의 Redirect URLs 허용 목록에는 앱 콜백을 등록한다. Google·네이버처럼
브라우저를 여는 공급자는 외부 로그인 완료 후 먼저 Supabase 공급자 콜백으로
돌아오고, Supabase가 앱 콜백으로 다시 보낸다.

## Apple

- 방식: `expo-apple-authentication`으로 받은 ID Token을 Supabase에 전달
- Client ID: iOS Bundle ID `com.ridemap.app`
- Apple Developer의 Sign in with Apple capability와 Supabase Apple 공급자를 활성화

네이티브 ID Token 방식만 사용하므로 Services ID, `.p8` 개인 키, OAuth secret은
필요하지 않다. 웹 Apple 로그인까지 추가할 때만 별도 OAuth 설정을 한다.

## 카카오

- 방식: 카카오 네이티브 SDK로 받은 ID Token을 Supabase에 전달
- Supabase Client ID: 카카오 REST API 키
- Supabase Client Secret: Kakao Login Client Secret

카카오 개발자 콘솔에서 다음 항목을 확인한다.

1. 카카오 로그인 사용을 켠다.
2. OpenID Connect를 켠다.
3. REST API 키의 Redirect URI에 Supabase 공급자 콜백을 등록한다.
4. Kakao Login Client Secret을 활성화한다.
5. 닉네임·프로필 사진·이메일 동의 항목을 설정한다. 이메일을 필수로 받을 수
   없다면 Supabase에서 이메일이 없는 사용자도 허용한다.

## Google

Google Auth Platform에서 **웹 애플리케이션** OAuth 클라이언트를 만든다. 앱은
Google 네이티브 SDK를 추가하지 않고 Supabase 브라우저 OAuth를 사용한다.

1. 승인된 리디렉션 URI에 Supabase 공급자 콜백을 등록한다.
2. 앱 홈페이지와 개인정보 처리방침에는 `motomap.kr` 주소를 사용한다.
3. 발급된 Client ID와 Client Secret을 Supabase Google 공급자에 저장하고
   공급자를 활성화한다.

## 네이버

네이버 개발자센터에서 지도용 Naver Cloud 키와 별개인 **네이버 로그인**
애플리케이션을 만든다.

1. 사용 API로 네이버 로그인을 선택한다.
2. 서비스 URL은 `https://motomap.kr`로 등록한다.
3. Callback URL은 Supabase 공급자 콜백으로 등록한다.
4. 회원 이름·이메일·별명·프로필 사진 중 서비스에 필요한 항목만 요청한다.
5. Client ID와 Client Secret을 Supabase의 `custom:naver` OAuth2 공급자에 저장한다.

`custom:naver` 공급자 설정값은 다음과 같다.

- Authorization URL: `https://nid.naver.com/oauth2.0/authorize`
- Token URL: `https://nid.naver.com/oauth2.0/token`
- UserInfo URL:
  `https://rpbifswrkjcjojaulvor.supabase.co/functions/v1/naver-userinfo`
- PKCE: 활성화

네이버 프로필 응답은 표준 OAuth UserInfo 모양이 아니므로 `naver-userinfo` Edge
Function이 `sub`, `email`, `name`, `picture`로 변환한다.

## 출시 전 실기기 확인

- 공급자별 신규 가입, 취소, 로그아웃 후 재로그인
- 이메일이 같은 기존 계정과 자동 연결되는지 확인
- 설정에서 수동 연결 후 기존 데이터와 사용자 ID가 유지되는지 확인
- 신규 소셜 계정이 프로필·약관 온보딩을 완료하기 전 앱 기능에 진입하지 않는지 확인
- 최근 사용한 로그인 방식 뱃지가 다음 로그아웃 화면에 표시되는지 확인
- Apple의 이메일 가리기와 카카오·네이버의 이메일 미제공 계정을 각각 확인

