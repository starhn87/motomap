#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapView.h>

NS_ASSUME_NONNULL_BEGIN
// 기본 POI를 유지한 채 앱이 소유하는 일반휘발유 가격 마커만 관리한다.
@interface KNNaviGasPriceLayer : NSObject
@property(nonatomic, copy, nullable) void (^onFetch)(void);
@property(nonatomic, copy, nullable) void (^onSelect)(NSDictionary *station);
@property(nonatomic, readonly, nullable) NSDictionary *context;
- (instancetype)initWithMap:(KNMapView *)map;
- (void)attachToMap:(KNMapView *)map;
- (void)updatePosition:(DoublePoint)position timestamp:(nullable NSDate *)timestamp active:(BOOL)active;
- (void)applyResponse:(NSDictionary *)response;
- (void)pause;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
