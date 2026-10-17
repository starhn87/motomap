#import "KNNaviAudioFocus.h"
#import <dispatch/dispatch.h>

@interface KNNaviAudioFocus ()
@property(nonatomic, strong) AVAudioSession *session;
@property(nonatomic, strong) NSHashTable *voices;
@property(nonatomic, copy, nullable) AVAudioSessionCategory savedCategory;
@property(nonatomic, copy, nullable) AVAudioSessionMode savedMode;
@property(nonatomic, assign) AVAudioSessionCategoryOptions savedOptions;
@property(nonatomic, assign) BOOL ownsFocus;
@property(nonatomic, assign) BOOL interrupted;
@property(nonatomic, assign) BOOL stopped;
@end

@implementation KNNaviAudioFocus

- (instancetype)initWithSession:(AVAudioSession *)session {
  self = [super init];
  if (self) {
    _session = session;
    // 취소된 대기 음성은 시작 없이 종료만 올 수 있고, 같은 코드의 다른 음성도 있다.
    _voices = [NSHashTable hashTableWithOptions:NSPointerFunctionsStrongMemory |
                                                 NSPointerFunctionsObjectPointerPersonality];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(audioInterrupted:)
        name:AVAudioSessionInterruptionNotification object:nil];
  }
  return self;
}

- (void)restoreSession {
  NSError *error = nil;
  // 마지막 음성이 끝난 뒤에만 내린다. 다른 앱의 음성/음악 재개도 iOS에 알린다.
  if (self.ownsFocus) {
    self.ownsFocus = NO;
    if (![self.session setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&error]) {
      NSLog(@"[KNSDK] 음성 오디오 우선권 해제 실패 (%ld)", (long)error.code);
    }
  }
  if (self.savedCategory == nil) return;
  error = nil;
  if (![self.session setCategory:self.savedCategory mode:self.savedMode
                        options:self.savedOptions error:&error]) {
    NSLog(@"[KNSDK] 음성 이전 오디오 설정 복원 실패 (%ld)", (long)error.code);
    return; // 다음 안내/종료에서 재시도할 원래 설정을 보존한다.
  }
  self.savedCategory = nil;
  self.savedMode = nil;
}

- (void)beginVoice:(id)voice {
  if (self.stopped || self.interrupted || voice == nil || [self.voices containsObject:voice]) return;
  if (self.voices.count == 0) {
    [self restoreSession];
    if (self.savedCategory != nil) return;
    self.savedCategory = self.session.category;
    self.savedMode = self.session.mode;
    self.savedOptions = self.session.categoryOptions;
    NSError *error = nil;
    // SDK 재생 직전 호출된다. 시작 때 세션을 비활성화해 진행 중 소리를 끊지 않는다.
    AVAudioSessionCategoryOptions options = AVAudioSessionCategoryOptionMixWithOthers |
        AVAudioSessionCategoryOptionDuckOthers |
        AVAudioSessionCategoryOptionInterruptSpokenAudioAndMixWithOthers;
    if (![self.session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault
                          options:options error:&error]) {
      self.savedCategory = nil;
      self.savedMode = nil;
      NSLog(@"[KNSDK] 음성 오디오 우선권 설정 실패 (%ld)", (long)error.code);
      return;
    }
    self.ownsFocus = YES;
    if (![self.session setActive:YES error:&error]) {
      NSLog(@"[KNSDK] 음성 오디오 활성화 실패 (%ld)", (long)error.code);
      [self restoreSession];
      return;
    }
    if (self.interrupted || self.stopped) { [self restoreSession]; return; }
  }
  [self.voices addObject:voice];
}

- (void)endVoice:(id)voice {
  if (voice == nil || ![self.voices containsObject:voice]) return;
  [self.voices removeObject:voice];
  if (self.voices.count == 0) [self restoreSession];
}

- (void)audioInterrupted:(NSNotification *)notification {
  if (!NSThread.isMainThread) {
    __weak KNNaviAudioFocus *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf audioInterrupted:notification]; });
    return;
  }
  self.interrupted = [notification.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue]
      == AVAudioSessionInterruptionTypeBegan;
  if (self.interrupted) {
    [self.voices removeAllObjects];
    [self restoreSession];
  }
  // 전화 종료 시 이전 안내를 임의로 다시 재생/활성화하지 않고 다음 안내를 기다린다.
}

- (void)stop {
  self.stopped = YES;
  [self.voices removeAllObjects];
  [self restoreSession];
}

- (void)dealloc {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self stop];
}
@end
