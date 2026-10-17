#import <Foundation/Foundation.h>
#import "KNNaviAudioFocus.h"

@interface AudioFocusSessionFixture : NSObject
@property(nonatomic, copy) AVAudioSessionCategory category;
@property(nonatomic, copy) AVAudioSessionMode mode;
@property(nonatomic, assign) AVAudioSessionCategoryOptions categoryOptions;
@property(nonatomic, assign) BOOL active;
@property(nonatomic, assign) BOOL failCategory;
@property(nonatomic, assign) BOOL failActivation;
@property(nonatomic, strong) NSMutableArray<NSString *> *calls;
@end
@implementation AudioFocusSessionFixture
- (instancetype)init {
  if ((self = [super init])) {
    _category = AVAudioSessionCategoryPlayback;
    _mode = AVAudioSessionModeDefault;
    _categoryOptions = AVAudioSessionCategoryOptionMixWithOthers;
    _active = YES;
    _calls = [NSMutableArray array];
  }
  return self;
}
- (BOOL)setCategory:(AVAudioSessionCategory)category mode:(AVAudioSessionMode)mode
            options:(AVAudioSessionCategoryOptions)options error:(NSError **)error {
  [self.calls addObject:@"category"];
  if (self.failCategory) { if (error) *error = [NSError errorWithDomain:@"fixture" code:1 userInfo:nil]; return NO; }
  self.category = category; self.mode = mode; self.categoryOptions = options; return YES;
}
- (BOOL)setActive:(BOOL)active error:(NSError **)error {
  [self.calls addObject:active ? @"activate" : @"deactivate"];
  if (active && self.failActivation) { if (error) *error = [NSError errorWithDomain:@"fixture" code:2 userInfo:nil]; return NO; }
  self.active = active; return YES;
}
- (BOOL)setActive:(BOOL)active withOptions:(AVAudioSessionSetActiveOptions)options error:(NSError **)error {
  if (!active && (options & AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation)) [self.calls addObject:@"notifyOthers"];
  return [self setActive:active error:error];
}
@end

@interface EqualVoiceFixture : NSObject @end
@implementation EqualVoiceFixture
- (BOOL)isEqual:(id)object { return [object isKindOfClass:EqualVoiceFixture.class]; }
- (NSUInteger)hash { return 1; }
@end

// UIKit simulator runner가 메인 스레드에서 실행한다. 실제 시스템 감쇠의 음향 검사는 별도다.
int RunKNNaviAudioFocusTests(void) {
  int failures = 0; int checks = 0;
#define CHECK(condition, label) do { checks++; if (!(condition)) { failures++; NSLog(@"FAIL audio focus: %@", label); } } while (0)
  AudioFocusSessionFixture *session = [AudioFocusSessionFixture new];
  KNNaviAudioFocus *focus = [[KNNaviAudioFocus alloc] initWithSession:(AVAudioSession *)session];
  NSObject *a = [EqualVoiceFixture new], *b = [EqualVoiceFixture new], *unplayed = [NSObject new];
  [focus endVoice:unplayed];
  CHECK(session.calls.count == 0, @"대기 음성 취소는 포커스를 바꾸지 않는다");
  [focus beginVoice:a];
  CHECK((session.categoryOptions & AVAudioSessionCategoryOptionDuckOthers) != 0, @"안내 중 감쇠");
  CHECK((session.categoryOptions & AVAudioSessionCategoryOptionInterruptSpokenAudioAndMixWithOthers) != 0, @"음성 콘텐츠 중단 요청");
  CHECK(session.active && ![session.calls containsObject:@"deactivate"], @"시작 시 오디오를 먼저 끊지 않는다");
  NSUInteger startedCalls = session.calls.count;
  [focus beginVoice:a];
  CHECK(session.calls.count == startedCalls, @"중복 시작은 멱등");
  [focus beginVoice:b]; [focus endVoice:a]; [focus endVoice:a]; [focus endVoice:unplayed];
  CHECK(session.active && (session.categoryOptions & AVAudioSessionCategoryOptionDuckOthers), @"동일한 값의 다른 객체/지연 종료가 다음 음성을 해제하지 않는다");
  [focus endVoice:b];
  CHECK(!session.active && session.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers, @"마지막 종료 뒤 원복/비활성화");
  CHECK([session.calls containsObject:@"notifyOthers"], @"다른 앱 재개 통지");
  CHECK([session.category isEqualToString:AVAudioSessionCategoryPlayback] && [session.mode isEqualToString:AVAudioSessionModeDefault], @"원래 category/mode 복원");
  [focus beginVoice:a];
  [NSNotificationCenter.defaultCenter postNotificationName:AVAudioSessionInterruptionNotification object:session
      userInfo:@{ AVAudioSessionInterruptionTypeKey: @(AVAudioSessionInterruptionTypeBegan) }];
  CHECK(!session.active && session.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers, @"전화 중단 시 해제");
  NSUInteger interruptedCalls = session.calls.count;
  [focus beginVoice:b];
  CHECK(session.calls.count == interruptedCalls, @"전화 중 우선권 재획득 금지");
  [NSNotificationCenter.defaultCenter postNotificationName:AVAudioSessionInterruptionNotification object:session
      userInfo:@{ AVAudioSessionInterruptionTypeKey: @(AVAudioSessionInterruptionTypeEnded) }];
  CHECK(session.calls.count == interruptedCalls, @"전화 종료 시 임의 재생 금지");
  [focus beginVoice:b]; [focus endVoice:a];
  CHECK(session.active && (session.categoryOptions & AVAudioSessionCategoryOptionDuckOthers), @"전화 전 지연 종료는 새 안내를 해제하지 않는다");
  [focus stop]; [focus stop];
  CHECK(!session.active && session.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers, @"종료 누락을 강제 정리/중복 정리 안전");
  NSUInteger stoppedCalls = session.calls.count; [focus beginVoice:a]; [focus endVoice:b];
  CHECK(session.calls.count == stoppedCalls, @"화면 종료 뒤 늦은 콜백 무시");

  AudioFocusSessionFixture *failed = [AudioFocusSessionFixture new]; failed.failCategory = YES;
  KNNaviAudioFocus *failureFocus = [[KNNaviAudioFocus alloc] initWithSession:(AVAudioSession *)failed];
  [failureFocus beginVoice:a];
  CHECK(failed.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers && ![failed.calls containsObject:@"activate"], @"설정 실패 때 활성화 안 함");
  failed.failCategory = NO; failed.failActivation = YES; [failureFocus beginVoice:a];
  CHECK(!failed.active && failed.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers, @"활성화 실패도 감쇠 원복");
  failed.failActivation = NO; [failureFocus beginVoice:a];
  CHECK(failed.active && (failed.categoryOptions & AVAudioSessionCategoryOptionDuckOthers), @"실패 후 다음 안내 재시도");
  [failureFocus stop];
  AudioFocusSessionFixture *restoreFailure = [AudioFocusSessionFixture new];
  KNNaviAudioFocus *retryFocus = [[KNNaviAudioFocus alloc] initWithSession:(AVAudioSession *)restoreFailure];
  [retryFocus beginVoice:a]; restoreFailure.failCategory = YES; [retryFocus endVoice:a];
  CHECK(!restoreFailure.active, @"복원 실패에도 세션 비활성화");
  restoreFailure.failCategory = NO; [retryFocus beginVoice:b]; [retryFocus endVoice:b];
  CHECK(restoreFailure.categoryOptions == AVAudioSessionCategoryOptionMixWithOthers, @"복원 재시도가 감쇠 설정을 새 기준으로 저장하지 않는다");
  [retryFocus stop];
  NSLog(@"AUDIO_FOCUS_TESTS checks=%d failures=%d", checks, failures);
  return failures;
#undef CHECK
}
