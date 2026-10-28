#import <UIKit/UIKit.h>
#import <KNSDK/KNSDK.h>
#import <KNSDK/KNMapView.h>
NS_ASSUME_NONNULL_BEGIN
@interface KNNaviOwnedPoiLayer : NSObject
@property(nonatomic, copy, nullable) BOOL (^isActive)(void);
@property(nonatomic, copy, nullable) void (^onRequest)(void);
@property(nonatomic, copy, nullable) void (^onSelect)(NSString *key, NSString *snapshotId);
@property(nonatomic, copy, nullable) void (^onModeChanged)(BOOL owned);
@property(nonatomic, copy, nullable) NSArray<NSValue *> *(^exclusions)(void);
@property(nonatomic, readonly, nullable) NSDictionary *context;
@property(nonatomic, readonly) BOOL ownsPoiVisibility;
- (instancetype)initWithMap:(KNMapView *)map;
- (BOOL)applyResponse:(NSDictionary *)response;
- (void)refresh;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
