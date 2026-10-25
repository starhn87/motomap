#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapView.h>
#import <KNSDK/KNGPSData.h>
NS_ASSUME_NONNULL_BEGIN
// 가격 마커와 검색 시트는 같은 응답을 공유한다. SDK 소유 마커/리스너는 보존한다.
@interface KNNaviGasLayer : NSObject
@property(nonatomic, copy) void (^onFetch)(void);
@property(nonatomic, copy) void (^onRoute)(void);
@property(nonatomic, copy) BOOL (^isActive)(void);
@property(nonatomic, readonly, nullable) NSDictionary *context;
@property(nonatomic, readonly, nullable) NSDictionary *selection;
- (instancetype)initWithHost:(UIViewController *)host;
- (void)attachMap:(KNMapView *)map;
- (void)updateGPS:(nullable KNGPSData *)gps;
- (void)showSearch;
- (void)applyResponse:(NSDictionary *)response;
- (nullable NSDictionary *)takeSelection;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
