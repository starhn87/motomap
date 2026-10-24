#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
FOUNDATION_EXPORT const CGFloat KNNaviBottomCollapsedHeight;
FOUNDATION_EXPORT const CGFloat KNNaviBottomRecenterHeight;
@interface KNNaviBottomPanel : UIView
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
