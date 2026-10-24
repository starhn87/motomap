#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
FOUNDATION_EXPORT const CGFloat KNNaviBottomCollapsedHeight;
@interface KNNaviBottomPanel : UIView
@property(nonatomic, copy, nullable) void (^onAction)(NSString *action, NSDictionary *payload);
@property(nonatomic, copy, nullable) void (^onHeight)(CGFloat height);
@property(nonatomic, copy, nullable) void (^onFailure)(void);
@property(nonatomic, readonly) BOOL ready;
@property(nonatomic, readonly) BOOL failed;
@property(nonatomic, readonly) BOOL expanded;
- (void)updateState:(NSDictionary *)state;
- (void)setBottomInset:(CGFloat)inset;
- (void)collapse;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
