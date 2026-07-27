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
  # 카카오내비 SDK — CocoaPods 공개 배포
  s.dependency 'KNSDK'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
