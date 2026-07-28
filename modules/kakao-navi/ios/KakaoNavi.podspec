Pod::Spec.new do |s|
  s.name           = 'KakaoNavi'
  s.version        = '1.0.0'
  s.summary        = '카카오내비 SDK(KNSDK) 브리지'
  s.description    = '앱 안에서 이륜차 길안내를 띄우기 위한 KNSDK 래퍼'
  s.author         = ''
  s.homepage       = 'https://developers.kakaomobility.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # 카카오내비 SDK. KNSDK 와 KNSDK-UI 는 별개 라이브러리가 아니라 같은
  # KNSDK.xcframework 의 두 빌드다(둘 다 넣으면 이름 충돌로 pod install 이 막힌다).
  # 길안내 화면(KNNaviView)은 UI 빌드에만 들어 있어 이쪽을 쓴다.
  s.dependency 'KNSDK-UI', '1.12.14'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
