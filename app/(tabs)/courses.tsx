import ActivityScreen from '@/components/activity/ActivityScreen';
import { withNativeTabScreen } from '@/components/navigation/NativeTabScreen';

// 기존 /courses 주소는 유지하지만, 탭의 콘텐츠와 이름은 활동으로 바뀐다.
export default withNativeTabScreen(ActivityScreen, { title: '활동' });
