#import <Foundation/Foundation.h>
#import <AVFAudio/AVAudioSession.h>

NS_ASSUME_NONNULL_BEGIN

// SDK 음성 객체의 시작/종료에 맞춰 짧게 오디오 우선권을 빌린다. 호출은 메인 스레드다.
@interface KNNaviAudioFocus : NSObject
- (instancetype)initWithSession:(AVAudioSession *)session;
- (void)beginVoice:(id)voice;
- (void)endVoice:(id)voice;
- (void)stop;
@end

NS_ASSUME_NONNULL_END
