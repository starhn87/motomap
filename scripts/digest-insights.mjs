// 주간 다이제스트 인사이트 — 다이제스트 마크다운을 Claude 에 보내 분석 코멘트를 만든다.
// weekly-digest.yml 이 이슈 생성 직후 실행해 코멘트로 단다 (ANTHROPIC_API_KEY 필요).
// 사용: ANTHROPIC_API_KEY=... node scripts/digest-insights.mjs digest.md
//
// @anthropic-ai/sdk 는 devDependency — 앱 번들에는 들어가지 않는다.

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 가 필요합니다');
  process.exit(1);
}
const digest = readFileSync(process.argv[2] ?? 'digest.md', 'utf8');

const SYSTEM = `너는 모토맵(오토바이 라이더용 지도 앱, 1인 개발, 최근 App Store 출시)의 주간 운영 데이터를 분석하는 애널리스트다. 매주 GitHub 이슈로 올라오는 다이제스트 마크다운을 읽고 인사이트 코멘트를 작성한다.

도메인 컨텍스트:
- 퍼널: 검색 결과 노출 → 결과 선택 → 장소 상세 조회 → 경로 미리보기 → 길안내 시작 → 길안내 종료(도착·중도 종료)
- "실주행"은 mode=live 길안내만 센 것 (모의 주행 preview 제외)
- v2 검색 선택률은 같은 search_id의 결과 노출 세션 중 하나라도 고른 세션 비율이다
- v2 실주행 도착률은 같은 guide_session_id의 live 시작 세션 대비 도착 세션 비율이다
- "비정상 종료"는 안내 마커가 다음 앱 실행까지 남은 세션이다. 크래시뿐 아니라 강제 종료·OS 종료도 포함하므로 크래시율로 해석하지 않는다
- 개별 검색어와 미등록 도착지는 개인정보 보호 때문에 공개 다이제스트에 포함하지 않는다
- 출시 초기라 표본이 작고 개발자 자신의 테스트가 섞여 있을 수 있다

작성 규칙:
- 한국어 마크다운, 핵심 인사이트 3~5개를 불릿으로. 전체 600자 이내.
- 함께 일하는 동료에게 공유하듯 자연스러운 존댓말(해요체)로 쓴다 — "~로 보여요", "~해볼 만해요", "~인 것 같아요". 반말·명령조("~할 것", "~하라", "~이다")는 절대 쓰지 않는다.
- 단정적인 선언보다 관찰과 제안의 톤으로. 딱딱한 보고서가 아니라 동료의 코멘트처럼.
- 표의 숫자를 다시 나열하지 말고 의미를 말한다: 퍼널의 병목, 이상 신호, 이번 주에 해볼 만한 액션 1~2개.
- 표본이 작으면 과장하지 말고 불확실하다고 말한다.`;

const client = new Anthropic();
const response = await client.beta.messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  // 안전 분류기가 거부하면 서버가 대체 모델로 재시도한다 (주간 데이터 분석이라 사실상 발동 없음)
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
  system: SYSTEM,
  messages: [{ role: 'user', content: digest }],
});

if (response.stop_reason === 'refusal') {
  console.error('모델이 응답을 거부했습니다');
  process.exit(1);
}
const text = response.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('\n')
  .trim();

console.log('## 🤖 이번 주 인사이트\n');
console.log(text);
console.log(`\n---\n_${response.model} 가 다이제스트를 분석해 자동 작성한 코멘트입니다._`);
