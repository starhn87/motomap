import { LEGAL_DOCS, LEGAL_PUBLICATION } from '../constants/legal';
import { legalPublicationErrors } from '../lib/legalPublication';

const requireReady = process.argv.includes('--ready');
const errors = legalPublicationErrors(LEGAL_PUBLICATION, requireReady);
if (LEGAL_PUBLICATION.status === 'draft') {
  for (const document of Object.values(LEGAL_DOCS)) {
    if (!document.content.includes('2026년 8월 18일')) errors.push('기존 가입 동의 본문이 변경됐습니다.');
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`고지 설정 정상: ${LEGAL_PUBLICATION.revision} / ${LEGAL_PUBLICATION.status}`);
  if (!requireReady) console.log('정적 동기화 검사이며 실제 시행·고지·서버 동의 반영 확인이 아닙니다.');
}
