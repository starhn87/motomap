#import <UIKit/UIKit.h>

// 무응답은 안내 유지다. 종료는 명시적인 '예' 선택으로만 요청한다.
@interface KNNaviArrivalPrompt : UIViewController
- (instancetype)initWithCompletion:(void (^)(BOOL endGuide))completion;
- (void)cancel;
- (void)invalidate;
@end
