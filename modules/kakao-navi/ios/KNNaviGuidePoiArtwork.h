#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
@interface KNNaviGuidePoiArtwork : NSObject
+ (UIImage *)imageForPoi:(NSDictionary *)poi;
+ (UIImage *)markerImageForPoi:(NSDictionary *)poi;
@end
NS_ASSUME_NONNULL_END
