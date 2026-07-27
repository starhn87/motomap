#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// 길안내 화면을 모토맵 톤으로 맞춘다. SDK 기본 자차 아이콘 대신 원형 화살표를 쓴다.
//
// ⚠️ KNSDK 1.10.9 에서는 아직 화면에 반영되지 않는다. mapView 도 이미지(48x48 4종)도
// 정상인데 setCustomCarImages 를 표시 직후·안내 시작·첫 위치 갱신 세 시점에 걸어봐도
// 기본 아이콘 그대로였다. SDK 쪽 한계로 보고 보류 — 최신 1.12.x 는 Realm 심사 리젝
// 선례가 있어 아이콘 때문에 올릴 일은 아니다.
@interface KNNaviTheme : NSObject

// [자차 on 주간, on 야간, off 주간, off 야간] — SDK 가 요구하는 순서.
+ (NSArray<UIImage *> *)carImages;

// 자차 이미지의 기준점(중앙).
+ (CGPoint)carAnchor;

@end

NS_ASSUME_NONNULL_END
