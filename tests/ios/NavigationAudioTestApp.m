#import <UIKit/UIKit.h>
#import "KNNaviAudioFocus.h"

extern int RunKNNaviAudioFocusTests(void);

@interface NavigationAudioTestScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation NavigationAudioTestScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = [UIViewController new];
  [self.window makeKeyAndVisible];
  dispatch_async(dispatch_get_main_queue(), ^{
    int failures = RunKNNaviAudioFocusTests();
    AVAudioSession *session = AVAudioSession.sharedInstance;
    NSError *error = nil;
    BOOL configured = [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault
                                  options:AVAudioSessionCategoryOptionMixWithOthers error:&error];
    configured = configured && [session setActive:YES error:&error];
    NSUInteger initial = session.categoryOptions;
    KNNaviAudioFocus *focus = [[KNNaviAudioFocus alloc] initWithSession:session];
    NSObject *voice = [NSObject new];
    [focus beginVoice:voice]; NSUInteger during = session.categoryOptions;
    [focus endVoice:voice]; NSUInteger after = session.categoryOptions;
    [focus stop];
    BOOL restored = configured && !(initial & AVAudioSessionCategoryOptionDuckOthers)
        && (during & AVAudioSessionCategoryOptionDuckOthers) && after == initial;
    if (!restored) failures++;
    NSString *result = [NSString stringWithFormat:@"AUDIO_POLICY_RESULT failures=%d initial=%lu during=%lu after=%lu\n",
        failures, (unsigned long)initial, (unsigned long)during, (unsigned long)after];
    NSString *path = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject
        stringByAppendingPathComponent:@"audio-policy-result.txt"];
    [result writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    NSLog(@"%@", result);
  });
}
@end
@interface NavigationAudioTestApp : UIResponder <UIApplicationDelegate> @end
@implementation NavigationAudioTestApp
- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *configuration = [[UISceneConfiguration alloc] initWithName:@"AudioTests" sessionRole:session.role];
  configuration.delegateClass = NavigationAudioTestScene.class;
  return configuration;
}
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(NavigationAudioTestApp.class)); }
}
