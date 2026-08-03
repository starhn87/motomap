#import <UIKit/UIKit.h>
#import <KNSDK/KNMapRouteTheme.h>

NS_ASSUME_NONNULL_BEGIN

// 길안내 화면을 모토맵 톤으로 맞춘다. SDK 기본 자차 아이콘 대신 원형 화살표를 쓴다.
//
// 이륜차 여정에서는 setCustomCarImages 만으로 적용되지 않는다 — 적용 경로는
// KNNaviPresenter 의 applyCarTheme 참고 (carImageType 우회).
@interface KNNaviTheme : NSObject

// [자차 on 주간, on 야간, off 주간, off 야간] — SDK 가 요구하는 순서.
+ (NSArray<UIImage *> *)carImages;

// 자차 이미지의 기준점(중앙).
+ (CGPoint)carAnchor;

// 주행 경로선 테마. SDK 는 테마를 통째로 갈아끼우는 API 만 열어 두어서
// (읽어오는 getter 가 없다) 혼잡도 색까지 전부 우리가 정한다.
// 혼잡도 색이 들어간 테마 (trafficMode:YES 일 때 그려지는 쪽)
+ (KNMapRouteTheme *)routeThemeDay;
+ (KNMapRouteTheme *)routeThemeNight;
// 혼잡도 없이 단색으로 그리는 테마
+ (KNMapRouteTheme *)driveThemeDay;
+ (KNMapRouteTheme *)driveThemeNight;

@end

NS_ASSUME_NONNULL_END
