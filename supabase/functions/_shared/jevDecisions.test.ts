import { assessMotoChat, MOTO_CHAT_QUESTIONS } from './jevChat.ts';
import { observeSubmission, submissionQuestions } from './jevSubmission.ts';
import { SUBMISSION_POLICY_RULE_IDS, SUBMISSION_POLICY_VERSION } from './submissionPolicy.ts';

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
const mockReply = (choice = 'clearly_off_topic'): typeof fetch => (_url, init) => {
  const body = JSON.parse(String(init?.body));
  const answers = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => {
    const labels = Object.keys((q as { criteria: object }).criteria);
    const selected = labels.includes(choice) ? choice : 'unknown';
    return [id, { type: 'choice', choice: selected, confidence: 1, probabilities: Object.fromEntries(labels.map(label => [label, label === selected ? 1 : 0])) }];
  }));
  return Promise.resolve(Response.json({ model: 'jev-1.13.0', answers }));
};
const messages = [{ role: 'user', content: '근처 카페?' }, { role: 'assistant', content: '양평을 추천해요.' }, { role: 'user', content: '거긴 비 오면?' }];

Deno.test('채팅은 shadow·미설정 임계값·불확실 판단·공급자 실패에서 기존 추천을 유지한다', async () => {
  for (const config of [
    { mode: 'shadow', threshold: .9, fetch: mockReply() },
    { mode: 'enforce', fetch: mockReply() },
    { mode: 'enforce', threshold: .9, fetch: mockReply('insufficient_context') },
    { mode: 'enforce', threshold: .9, fetch: () => Promise.resolve(Response.json({ answers: {} })) },
    { mode: 'enforce', threshold: .9, fetch: () => Promise.reject(new Error('private-error')) },
  ]) {
    assert(!(await assessMotoChat(messages, { ...config, apiKey: 'mock' })).decline);
  }
  assert((await assessMotoChat(messages, { apiKey: 'mock', mode: 'enforce', threshold: .9, fetch: mockReply() })).decline);
});

Deno.test('비활성·키 없음·과도한 입력·취소는 불필요한 요청을 시작하지 않는다', async () => {
  const noFetch = () => { throw new Error('Unexpected request'); };
  assert(!(await assessMotoChat(messages, { apiKey: 'mock', mode: 'off', fetch: noFetch })).decline);
  assert(!(await assessMotoChat(messages, { apiKey: '', mode: 'shadow', fetch: noFetch })).decline);
  assert(!(await assessMotoChat([{ role: 'user', content: 'x'.repeat(6001) }], { apiKey: 'mock', mode: 'shadow', fetch: noFetch })).decline);
  const signal = AbortSignal.abort();
  assert((await assessMotoChat(messages, { apiKey: 'mock', mode: 'shadow', signal, fetch: noFetch })).aborted);
});

Deno.test('짧은 후속 질문에도 이전 문맥을 전달하며 원문은 관측에 남기지 않는다', async () => {
  await assessMotoChat(messages, { apiKey: 'mock', mode: 'shadow', fetch: async (url, init) => {
    const request = JSON.parse(String(init?.body));
    assert(JSON.stringify(request.state.messages) === JSON.stringify(messages));
    assert(request.model === 'jev-1.13.0');
    assert(Object.keys(request.questions).length === Object.keys(MOTO_CHAT_QUESTIONS).length);
    return await mockReply('in_scope')(url, init);
  } });
});

Deno.test('심사 질문은 기존 규칙 ID와 카테고리 기준을 독립적으로 사용한다', () => {
  const cafe = submissionQuestions('places', 'cafe');
  assert('PLACE-CAFE' in cafe && !('PLACE-CAMPING' in cafe));
  assert('PLACE-COMMUNITY-SIGNALS' in cafe);
  for (const [table, category] of [['places', 'camping'], ['courses', ''], ['riding_guide_submissions', '']]) {
    for (const id of Object.keys(submissionQuestions(table, category))) assert((SUBMISSION_POLICY_RULE_IDS as readonly string[]).includes(id));
  }
  assert(Object.keys(submissionQuestions('riding_guide_submissions', '')).length === 5);
});

Deno.test('심사 관찰은 동일 근거·정책을 쓰며 실패·로그 예외에도 완료되고 원문을 로그하지 않는다', async () => {
  const input = { table: 'places', category: 'cafe', submitted: 'private-submission', evidence: 'private-evidence', baseline: 'uncertain' };
  const records: unknown[] = [];
  await observeSubmission(input, { apiKey: 'mock', mode: 'shadow', fetch: async (url, init) => {
    const request = JSON.parse(String(init?.body));
    assert(request.state.submitted === input.submitted && request.state.evidence === input.evidence);
    assert(request.state.policy.includes(SUBMISSION_POLICY_VERSION));
    return await mockReply()(url, init);
  } }, value => { records.push(value); });
  assert(records.length === 1 && (records[0] as { ok: boolean }).ok && !JSON.stringify(records).includes('private-'));
  await observeSubmission(input, { apiKey: 'mock', mode: 'shadow', fetch: mockReply() }, () => { throw new Error('log-failed'); });
  await observeSubmission(input, { apiKey: 'mock', mode: 'shadow', fetch: () => Promise.reject(new Error('secret-error')) }, value => { records.push(value); });
  assert(!JSON.stringify(records).includes('secret-error'));
  await observeSubmission(input, { apiKey: 'mock', mode: 'enforce', fetch: () => { throw new Error('Unexpected enforce'); } });
});
