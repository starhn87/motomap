#import "KNNaviArrivalPrompt.h"
#import <math.h>

@interface KNNaviArrivalPrompt (Test)
- (void)advanceToUptime:(NSTimeInterval)uptime;
- (void)endTapped;
- (void)continueTapped;
@end
@interface ArrivalPromptProbe : KNNaviArrivalPrompt @end
@implementation ArrivalPromptProbe
- (void)dismissViewControllerAnimated:(BOOL)animated completion:(void (^)(void))completion {
  [self viewDidDisappear:NO];
  if (completion) completion();
}
@end

@interface KNNaviViewController : UIViewController
- (void)pauseForInactive;
- (void)finish;
@end
@interface ArrivalUIControllerProbe : KNNaviViewController @end
@implementation ArrivalUIControllerProbe
- (void)viewDidLoad { self.view.backgroundColor = UIColor.systemBackgroundColor; }
- (void)viewDidAppear:(BOOL)animated {}
- (void)viewWillDisappear:(BOOL)animated {}
@end

// 실제 UIKit 전환 중 만료→비활성→외부 종료가 겹쳐도 부모까지 한 번에 닫혀야 한다.
void RunKNNaviArrivalPresentationTests(UIWindow *window, void (^completion)(int)) {
  ArrivalUIControllerProbe *guide = [ArrivalUIControllerProbe new];
  guide.modalPresentationStyle = UIModalPresentationFullScreen;
  [window.rootViewController presentViewController:guide animated:NO completion:^{
    KNNaviArrivalPrompt *prompt = [[KNNaviArrivalPrompt alloc] initWithCompletion:^(BOOL end) {}];
    [guide setValue:prompt forKey:@"arrivalPrompt"];
    [guide presentViewController:prompt animated:YES completion:^{
      UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:window.bounds.size];
      UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        [window drawViewHierarchyInRect:window.bounds afterScreenUpdates:YES];
      }];
      NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject
          stringByAppendingPathComponent:@"arrival-prompt.png"];
      [UIImagePNGRepresentation(image) writeToFile:path atomically:YES];
      NSTimeInterval deadline = [[prompt valueForKey:@"deadline"] doubleValue];
      [prompt advanceToUptime:deadline];
      [guide pauseForInactive];
      [guide finish];
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        BOOL retained = window.rootViewController.presentedViewController != nil || [prompt valueForKey:@"timer"] != nil;
        if (retained) NSLog(@"FAIL UIKit arrival dismissal left guide/modal/timer");
        completion(retained ? 1 : 0);
      });
    }];
  }];
}

int RunKNNaviArrivalPromptTests(void) {
  int failures = 0;
  __block NSUInteger ends = 0, keeps = 0;
  void (^choice)(BOOL) = ^(BOOL end) { if (end) ends++; else keeps++; };
  ArrivalPromptProbe *prompt = [[ArrivalPromptProbe alloc] initWithCompletion:choice];
  [prompt loadViewIfNeeded]; [prompt viewDidAppear:NO];
  NSTimeInterval deadline = [[prompt valueForKey:@"deadline"] doubleValue];
  if (fabs(deadline - NSProcessInfo.processInfo.systemUptime - 10) > 0.5) failures++;
  [prompt advanceToUptime:deadline - 6];
  UIButton *button = [prompt valueForKey:@"continueButton"];
  if (![button.currentTitle isEqualToString:@"아니오 (6초)"]) failures++;
  [prompt advanceToUptime:deadline]; [prompt endTapped];
  if (ends || keeps != 1 || [prompt valueForKey:@"timer"]) {
    NSLog(@"FAIL arrival timeout ended guide or left a timer"); failures++;
  }
  prompt = [[ArrivalPromptProbe alloc] initWithCompletion:choice];
  [prompt loadViewIfNeeded]; [prompt viewDidAppear:NO];
  [prompt continueTapped]; [prompt continueTapped];
  if (ends || keeps != 2) { NSLog(@"FAIL arrival no was not idempotent"); failures++; }
  prompt = [[ArrivalPromptProbe alloc] initWithCompletion:choice];
  [prompt loadViewIfNeeded]; [prompt viewDidAppear:NO];
  [prompt endTapped]; [prompt endTapped];
  if (ends != 1 || keeps != 2) { NSLog(@"FAIL explicit arrival yes not exactly once"); failures++; }
  prompt = [[ArrivalPromptProbe alloc] initWithCompletion:choice];
  [prompt loadViewIfNeeded]; [prompt viewDidAppear:NO];
  deadline = [[prompt valueForKey:@"deadline"] doubleValue];
  [prompt cancel]; [prompt advanceToUptime:deadline + 20]; [prompt endTapped];
  if (ends != 1 || keeps != 2 || [prompt valueForKey:@"timer"]) {
    NSLog(@"FAIL arrival cancellation left a callback/timer"); failures++;
  }
  return failures;
}
