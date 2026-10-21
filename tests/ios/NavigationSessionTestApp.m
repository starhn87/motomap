#import <UIKit/UIKit.h>
#import "KNNaviAudioFocus.h"

extern int RunKNNaviSessionTests(void);

@interface NavigationSessionTestScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation NavigationSessionTestScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = [UIViewController new];
  [self.window makeKeyAndVisible];
  dispatch_async(dispatch_get_main_queue(), ^{
    int failures = RunKNNaviSessionTests();
    NSString *result = [NSString stringWithFormat:@"NAV_SESSION_RESULT failures=%d done=1\n", failures];
    NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject
        stringByAppendingPathComponent:@"session-result.txt"];
    [result writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    NSLog(@"%@", result);
  });
}
@end
@interface NavigationSessionTestApp : UIResponder <UIApplicationDelegate> @end
@implementation NavigationSessionTestApp
- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *configuration = [[UISceneConfiguration alloc] initWithName:@"SessionTests" sessionRole:session.role];
  configuration.delegateClass = NavigationSessionTestScene.class;
  return configuration;
}
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(NavigationSessionTestApp.class)); }
}
