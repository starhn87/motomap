#import <UIKit/UIKit.h>
#import "KNNaviHazardSheet.h"

static BOOL HasLabel(UIView *view,NSString *text) {
  if ([view isKindOfClass:UILabel.class] && [((UILabel *)view).text isEqual:text]) return YES;
  for (UIView *child in view.subviews) if (HasLabel(child,text)) return YES;
  return NO;
}
// 기본 POI 탭 시트: 제목·경로 선택과 늦게 도착한 주유소 가격 설명 줄(NAV-059).
int RunKNNaviPoiSheetTests(void) {
  int failures=0;
  KNNaviHazardSheet *poi=[[KNNaviHazardSheet alloc] initWithTitle:@"지도 테스트 장소" detail:@"미리보기에서 확인 후 안내를 변경해요" options:@[@{@"key":@"goal",@"label":@"목적지로 설정",@"symbol":@"motomap.destination"},@{@"key":@"via",@"label":@"경유지로 추가",@"symbol":@"plus.circle"}] completion:^(NSInteger picked) {}];
  [poi loadViewIfNeeded];
  [poi updateDetail:@"휘발유 1,699원 · 고급휘발유 1,950원"];
  if (!HasLabel(poi.view,@"휘발유 1,699원 · 고급휘발유 1,950원")) { NSLog(@"FAIL POI sheet detail update"); failures++; }
  if (!HasLabel(poi.view,@"지도 테스트 장소") || !HasLabel(poi.view,@"목적지로 설정") || !HasLabel(poi.view,@"경유지로 추가") || poi.modalPresentationStyle!=UIModalPresentationOverFullScreen) { NSLog(@"FAIL app-owned POI sheet title/actions"); failures++; }
  return failures;
}
