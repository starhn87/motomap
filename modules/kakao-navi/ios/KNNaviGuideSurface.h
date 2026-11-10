#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
@interface KNNaviGuideSurface : NSObject
+ (nullable UIView *)viewWithRootFactory:(NSObject *)factory props:(NSDictionary *)props
    NS_SWIFT_NAME(make(rootFactory:props:));
@end
NS_ASSUME_NONNULL_END
