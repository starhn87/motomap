const app = document.querySelector('#app');
const windowLabel = document.querySelector('#window');
const logoutButton = document.querySelector('#logout');

const APPROVE_WARNING = '승인하면 장소 내용은 바꾸지 않고, 기존 승인 트리거가 제보자에게 알림·푸시를 보냅니다. 진행할까요?';
const REJECT_WARNING = '반려하면 장소 내용은 바꾸지 않고, 기존 반려 트리거가 제보자에게 사유 알림·푸시를 보냅니다. 진행할까요?';

const STATUS_TEXT = {
  done: '완료', doing: '진행 중', waiting: '대기', pass: '통과', fail: '실패',
  success: 'CI 통과', running: 'CI 실행 중', failure: 'CI 실패', none: 'CI 상태 없음', error: '조회 실패',
};
const SOURCE_TEXT = {
  disconnected: '미연결',
  error: '조회 실패',
  migration_missing: '저장 구조 미적용',
  empty: '이번 창에 해당 기록이 없습니다',
  configuration_blocked: '관리자 설정이 없거나 잘못되어 열 수 없습니다.',
  forbidden: '이 계정은 관리자가 아닙니다.',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sourceLine(state) {
  return SOURCE_TEXT[state] ?? '상태를 확인하지 못했습니다';
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function metricCard(title, value, detail) {
  const card = el('article', 'card');
  card.append(el('div', 'k', title), el('div', 'v', value), el('div', 'd', detail));
  return card;
}

function countText(block, render) {
  if (!block || block.state !== 'ok') return sourceLine(block?.state);
  return render(block);
}

function renderLogin(message) {
  logoutButton.hidden = true;
  windowLabel.textContent = '로그인 필요';
  app.replaceChildren();
  const card = el('form', 'card login stack');
  card.addEventListener('submit', (event) => event.preventDefault());
  card.append(el('h1', null, '관리자 로그인'), el('p', 'muted', message || '이메일 코드로 확인합니다. 허용된 계정만 들어옵니다.'));
  const email = el('input');
  email.type = 'email';
  email.autocomplete = 'username';
  email.placeholder = '이메일';
  const token = el('input');
  token.inputMode = 'numeric';
  token.autocomplete = 'one-time-code';
  token.placeholder = '코드';
  const status = el('p', 'note', '');
  const send = el('button', null, '코드 받기');
  send.type = 'button';
  send.addEventListener('click', async () => {
    status.textContent = '보내는 중';
    const result = await api('/admin/api/session/otp', { email: email.value });
    status.textContent = result.payload.state === 'code_sent' ? '코드를 보냈습니다.' : sourceLine(result.payload.state);
  });
  const verify = el('button', 'primary', '들어가기');
  verify.type = 'button';
  verify.addEventListener('click', async () => {
    const result = await api('/admin/api/session/verify', { email: email.value, token: token.value });
    if (result.payload.state === 'signed_in') load();
    else status.textContent = sourceLine(result.payload.state);
  });
  card.append(email, send, token, verify, status);
  app.append(card);
}

function bar(percent) {
  const track = el('div', 'bar');
  const fill = el('i');
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  track.append(fill);
  return track;
}

function manualEditor(kind, reload) {
  const box = el('form', 'stack');
  box.addEventListener('submit', (event) => event.preventDefault());
  const title = el('input');
  title.placeholder = kind === 'qa' ? 'QA 항목' : '이번 주 컷 항목';
  const status = el('select');
  const options = kind === 'qa'
    ? [['waiting', '대기'], ['pass', '통과'], ['fail', '실패']]
    : [['waiting', '대기'], ['doing', '진행 중'], ['done', '완료']];
  for (const [value, label] of options) status.append(new Option(label, value));
  const save = el('button', 'primary', '수동 저장');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const result = await api('/admin/api/manual', { kind, title: title.value, status: status.value });
    if (result.ok) reload();
    else save.textContent = sourceLine(result.payload.state);
  });
  box.append(el('div', 'inline', ''), title, status, save);
  box.querySelector('.inline').append(title, status, save);
  return box;
}

function renderDashboard(data) {
  logoutButton.hidden = false;
  windowLabel.textContent = data.windowLabel || '기간 없음';
  app.replaceChildren();
  app.append(el('h1', null, '대시보드'), el('p', 'muted', '수치는 각 출처의 조회 결과입니다. 연결되지 않은 칸은 미연결로 남깁니다.'));

  const metrics = el('section');
  metrics.append(el('h2', null, '핵심 지표'));
  const grid = el('div', 'grid m5');
  const m = data.metrics ?? {};
  grid.append(
    metricCard('주간 활성 사용자 (WAU)', countText(m.wau, (block) => String(block.current)), m.wau?.state === 'ok' ? `전 구간 ${m.wau.previous} · ${m.wau.delta} · ${m.wau.definition}` : sourceLine(m.wau?.state)),
    metricCard('실주행 세션', countText(m.liveNavigation, (block) => String(block.current)), m.liveNavigation?.state === 'ok' ? `이전 ${m.liveNavigation.previous} · ${m.liveNavigation.delta} · ${m.liveNavigation.definition}` : sourceLine(m.liveNavigation?.state)),
    metricCard('도착률', m.arrival?.state === 'ok' ? `${m.arrival.rate}%` : sourceLine(m.arrival?.state), m.arrival?.state === 'ok' ? `시작 ${m.arrival.started} · 도착 ${m.arrival.arrived} · ${m.arrival.definition}` : (m.arrival?.definition || sourceLine(m.arrival?.state))),
    metricCard('제보 퍼널 완료율', m.funnel?.state === 'ok' && m.funnel.rate != null ? `${m.funnel.rate}%` : sourceLine(m.funnel?.state === 'ok' ? 'empty' : m.funnel?.state), m.funnel?.state === 'ok' ? `열기 ${m.funnel.opened} · 시도 ${m.funnel.attempted} · 제출 ${m.funnel.submitted}` : sourceLine(m.funnel?.state)),
    metricCard('오류 · 크래시', m.exceptions?.state === 'ok' ? `${m.exceptions.js} / ${m.exceptions.native}` : sourceLine(m.exceptions?.state), m.exceptions?.state === 'ok' ? `JS / 네이티브 · 분류 불가 ${m.exceptions.other} · ${m.exceptions.definition}` : sourceLine(m.exceptions?.state)),
  );
  metrics.append(grid);
  if (m.funnel?.state === 'ok') {
    const funnel = el('article', 'card');
    funnel.append(el('div', 'k', '제보 퍼널 단계'));
    const steps = [
      ['제보 열기 (place_submission_opened)', m.funnel.opened],
      ['제보 시도 (place_submission_attempted)', m.funnel.attempted],
      ['제출 (place_submitted)', m.funnel.submitted],
    ];
    const base = Math.max(m.funnel.opened, m.funnel.attempted, 1);
    for (const [label, count] of steps) {
      const row = el('div', 'row');
      row.append(el('span', null, label), el('span', null, String(count)));
      funnel.append(row, bar(Math.round((count / base) * 100)));
    }
    if (m.funnel.results?.length) {
      funnel.append(el('p', 'note', m.funnel.results.map((item) => `${item.label} ${item.count}`).join(' · ')));
    }
    funnel.append(el('p', 'note', '위치 선택·내용 입력은 계측 이벤트가 없어 표시하지 않습니다.'));
    metrics.append(funnel);
  }
  app.append(metrics);

  const progress = el('section');
  progress.append(el('h2', null, '진행 상황'));
  const columns = el('div', 'grid p3');
  columns.append(manualCard('이번 주 컷', data.progress?.weeklyCut, 'weekly_cut'));
  columns.append(pullCard(data.progress?.pulls));
  columns.append(flightCard(data.progress?.testflight, data.progress?.qa));
  progress.append(columns);
  app.append(progress);

  const queue = el('section');
  queue.append(el('h2', null, '제보 · 건의'));
  const tableCard = el('div', 'card');
  if (data.queue?.state !== 'ok') {
    tableCard.append(el('p', null, sourceLine(data.queue?.state)));
  } else if (!data.queue.items.length) {
    tableCard.append(el('p', null, '대기 항목이 없습니다.'));
  } else {
    const table = el('table');
    const thead = el('thead');
    const head = el('tr');
    for (const label of ['유형', '내용', '지역', '추천', '처리']) head.append(el('th', null, label));
    thead.append(head);
    const tbody = el('tbody');
    for (const item of data.queue.items) tbody.append(queueRow(item, data.queue.storage));
    table.append(thead, tbody);
    tableCard.append(table);
  }
  if (data.queue?.storage && data.queue.storage !== 'ok') {
    tableCard.append(el('p', 'note', `PM 수동 추천: ${sourceLine(data.queue.storage)}`));
  }
  tableCard.append(el('p', 'note', '승인·반려는 장소 제보만 가능합니다. 다른 행은 읽기 전용입니다.'));
  queue.append(tableCard);
  app.append(queue);
}

function manualCard(title, block, kind) {
  const card = el('article', 'card');
  card.append(el('div', 'k', title));
  if (!block || block.state !== 'ok') {
    card.append(el('p', null, sourceLine(block?.state)));
    return card;
  }
  if (!block.items.length) card.append(el('p', 'muted', '수동 항목 없음'));
  for (const item of block.items) {
    const row = el('div', 'row');
    const stamp = item.updatedAt ? ` · ${item.source} · ${item.updatedAt}` : ` · ${item.source}`;
    row.append(el('span', null, `${item.title}${stamp}`), el('span', `st ${item.status === 'done' || item.status === 'pass' ? 'ok' : item.status === 'fail' ? 'ba' : 'wa'}`, STATUS_TEXT[item.status] ?? item.status));
    const remove = el('button', null, '삭제');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      const result = await api('/admin/api/manual', { kind, id: item.id, remove: true, title: item.title, status: item.status });
      if (result.ok) load();
    });
    row.append(remove);
    card.append(row);
  }
  card.append(manualEditor(kind, load));
  return card;
}

function pullCard(block) {
  const card = el('article', 'card');
  card.append(el('div', 'k', '열린 PR · CI'));
  if (!block || block.state !== 'ok') {
    card.append(el('p', null, sourceLine(block?.state)));
    return card;
  }
  if (!block.items.length) card.append(el('p', 'muted', '열린 PR 없음'));
  for (const item of block.items) {
    const row = el('div', 'row');
    const link = el('a', null, `#${item.number} ${item.title}`);
    link.href = item.url;
    row.append(link, el('span', `st ${item.ci === 'success' ? 'ok' : item.ci === 'failure' || item.ci === 'error' ? 'ba' : 'wa'}`, STATUS_TEXT[item.ci] ?? item.ci));
    card.append(row);
  }
  return card;
}

function flightCard(flight, qa) {
  const card = el('article', 'card');
  card.append(el('div', 'k', 'TestFlight 빌드 · QA'));
  if (!flight || flight.state !== 'ok') card.append(el('p', null, `TestFlight ${sourceLine(flight?.state)}`));
  else if (!flight.builds.length) card.append(el('p', 'muted', '빌드 0건'));
  else {
    for (const build of flight.builds) {
      const row = el('div', 'row');
      const name = `${build.marketingVersion ?? '버전 없음'} (${build.buildNumber ?? '빌드 없음'})`;
      const state = [build.processingState, build.externalBuildState].filter(Boolean).join(' · ') || '상태 없음';
      row.append(el('span', null, name), el('span', 'st', state));
      card.append(row);
    }
    card.append(el('p', 'note', 'Apple이 반환한 처리 상태입니다. 심볼 해석이나 QA 통과를 뜻하지 않습니다.'));
  }
  if (!qa || qa.state !== 'ok') card.append(el('p', null, `QA ${sourceLine(qa?.state)}`));
  else {
    if (!qa.total) card.append(el('p', 'muted', 'QA 수동 항목 없음'));
    else {
      card.append(el('p', null, `${qa.passed} / ${qa.total} 통과`), bar(Math.round((qa.passed / qa.total) * 100)));
      card.append(el('p', 'note', 'QA 숫자는 수동 입력입니다.'));
    }
    card.append(manualEditor('qa', load));
  }
  return card;
}

function queueRow(item, storage) {
  const row = el('tr');
  row.append(el('td', null, item.kindLabel), el('td', null, `${item.title}${item.detail ? ` · ${item.detail}` : ''}`), el('td', null, item.region || '—'));
  const recommendation = el('td');
  recommendation.append(el('div', null, item.ai?.label ?? 'AI 없음'));
  if (item.pm) recommendation.append(el('div', 'note', `PM 수동 · ${item.pm.body} · ${item.pm.updatedAt ?? ''}`));
  else recommendation.append(el('div', 'note', storage === 'ok' ? 'PM 수동 추천 없음' : `PM ${sourceLine(storage)}`));
  if (storage === 'ok') {
    const input = el('input');
    input.placeholder = 'PM 수동 추천';
    const save = el('button', null, '추천 저장');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const result = await api('/admin/api/recommendation', { targetKind: item.kind, targetId: item.id, body: input.value });
      if (result.ok) load();
      else save.textContent = sourceLine(result.payload.state);
    });
    recommendation.append(el('div', 'inline').appendChild(input).parentElement);
    recommendation.querySelector('.inline').append(save);
  }
  const actions = el('td');
  if (item.writable) {
    actions.append(decisionButton('승인', 'primary', 'approve', item.id), document.createTextNode(' '), decisionButton('반려', null, 'reject', item.id));
  } else {
    const disabled = el('button', null, '읽기 전용');
    disabled.disabled = true;
    actions.append(disabled);
  }
  row.append(recommendation, actions);
  return row;
}

function decisionButton(label, className, action, placeId) {
  const button = el('button', className, label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    const warning = action === 'approve' ? APPROVE_WARNING : REJECT_WARNING;
    if (!window.confirm(warning)) return;
    button.disabled = true;
    const result = await api('/admin/api/places/decision', {
      placeId,
      action,
      acknowledgeNotification: true,
    });
    if (result.ok) load();
    else {
      button.disabled = false;
      button.textContent = sourceLine(result.payload.state);
    }
  });
  return button;
}

async function load() {
  const result = await api('/admin/api/dashboard');
  if (result.status === 401) return renderLogin();
  if (!result.ok) {
    logoutButton.hidden = true;
    app.replaceChildren(el('p', null, sourceLine(result.payload.state)));
    return;
  }
  renderDashboard(result.payload);
}

logoutButton.addEventListener('click', async () => {
  await api('/admin/api/session/logout', {});
  renderLogin();
});

load();
