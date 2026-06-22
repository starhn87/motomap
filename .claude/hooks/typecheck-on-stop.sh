#!/usr/bin/env bash
# 한 턴 작업이 끝날 때(Stop), 커밋 안 된 .ts/.tsx 변경이 있으면 tsc로 타입체크한다.
# 타입 에러가 있으면 exit 2로 Claude에게 피드백해 고치게 한다.
# 변경이 없으면(대화만 한 턴 등) 조용히 통과한다.

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# 커밋되지 않은 TS 변경(staged/unstaged)이 없으면 스킵
if git diff --quiet HEAD -- '*.ts' '*.tsx' 2>/dev/null; then
  exit 0
fi

out=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  echo "$out" >&2
  echo "↑ tsc 타입 에러입니다. 고친 뒤 마무리하세요." >&2
  exit 2
fi

exit 0
