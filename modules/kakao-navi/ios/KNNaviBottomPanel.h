#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
FOUNDATION_EXPORT const CGFloat KNNaviBottomCollapsedHeight;
FOUNDATION_EXPORT const CGFloat KNNaviBottomRecenterHeight;
typedef UIView * _Nullable (^KNNaviGuideSurfaceFactory)(NSDictionary *props);
typedef void (^KNNaviGuideSurfaceEvent)(NSDictionary<NSString *, id> *payload);
@interface KNNaviBottomPanel : UIView
+ (void)setSurfaceFactory:(KNNaviGuideSurfaceFactory _Nullable)factory event:(KNNaviGuideSurfaceEvent _Nullable)event;
+ (nullable NSDictionary *)connectSurface:(NSString *)token menu:(BOOL)menu NS_SWIFT_NAME(connect(token:menu:));
+ (void)surfaceRendered:(NSString *)token menu:(BOOL)menu NS_SWIFT_NAME(rendered(token:menu:));
+ (void)surfaceAction:(NSString *)token action:(NSString *)action value:(nullable NSNumber *)value NS_SWIFT_NAME(handle(token:action:value:));
@property(nonatomic, copy, nullable) void (^onAction)(NSString *action, NSDictionary *payload);
@property(nonatomic, copy, nullable) void (^onHeight)(CGFloat height);
@property(nonatomic, copy, nullable) void (^onFailure)(void);
@property(nonatomic, readonly) BOOL ready;
@property(nonatomic, readonly) BOOL failed;
@property(nonatomic, readonly) BOOL expanded;
@property(nonatomic, strong, readonly) UIView *menuView;
@property(nonatomic, copy, nullable) void (^onMenuVisibility)(BOOL visible);
- (void)updateState:(NSDictionary *)state;
- (void)setBottomInset:(CGFloat)inset;
- (void)setMenuBottomInset:(CGFloat)inset;
- (void)showToast:(NSString *)message;
- (void)collapse;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
