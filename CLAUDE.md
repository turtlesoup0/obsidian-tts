# Quick Reference

1. "Before writing any code, describe your approach and wait for approval. Always ask clarifying questions before writing any code if requirements are ambiguous."
2. "If a task requires changes to more than 3 files, stop and break it into smaller tasks first."
3. "After writing code, list what could break and suggest tests to cover it."
4. "When there's a bug, start by writing a test that reproduces it, then fix it until the test passes."
5. "Every time I correct you, add a new rule to the CLAUDE.md file so it never happens again."

---

# Golden Rules

These rules take the HIGHEST priority and MUST be followed before any other directive.

## Rule 1: Approach First, Code Second

- [HARD] Before writing ANY code, describe your planned approach in detail and wait for explicit user approval
- [HARD] If requirements are ambiguous or underspecified, ask clarifying questions BEFORE writing a single line of code
- Never assume intent — validate understanding first, implement second
- Present your approach as a numbered plan showing: what files will be changed, what the changes will do, and why this approach was chosen
- Only proceed to implementation after receiving clear confirmation (e.g. "yes", "go ahead", "approved")

## Rule 2: Scope Control — 3-File Limit

- [HARD] If a task requires changes to more than 3 files, STOP immediately and break it into smaller, independently deliverable sub-tasks
- Present each sub-task with its scope (which files, what changes) and ask the user to confirm the order of execution
- Each sub-task should be completable and verifiable on its own
- This prevents large, hard-to-review changesets and reduces the risk of cascading errors

## Rule 3: Impact Analysis After Every Change

- [HARD] After writing or modifying code, provide an explicit impact analysis listing:
  1. What existing functionality could break as a result of the change
  2. Edge cases and boundary conditions that may be affected
  3. Suggested tests (unit, integration, or E2E) to cover the changed behavior
- Never consider a code change "done" until this analysis has been presented to the user

## Rule 4: Bug Fix Protocol — Test First

- [HARD] When fixing a bug, ALWAYS start by writing a failing test that reproduces the bug
- Only after the test reliably fails, implement the fix
- The fix is considered complete ONLY when the reproduction test passes along with all existing tests
- This ensures the bug is truly fixed and prevents regressions in the future

## Rule 5: Adaptive Learning — Self-Correcting Rules

- [HARD] Every time the user corrects a mistake or provides feedback on incorrect behavior, add a new rule to this CLAUDE.md file documenting the lesson learned
- The new rule must be specific, actionable, and prevent the exact same mistake from recurring
- Place new rules in a dedicated "Learned Rules" section at the bottom of this file
- Each learned rule should reference the date and context of the correction

---

# Learned Rules

## LR-001: 커밋은 반드시 사용자가 명시적으로 요청할 때만 (2026-02-06)

- [HARD] git commit은 사용자가 "커밋해", "commit 해줘" 등 명시적으로 요청할 때만 실행
- 코드 변경 후 자동으로 커밋하지 않음
- "Obsidian 파일 리버트 방지"와 같은 기술적 이유로도 사용자 동의 없이 커밋 금지
- 커밋이 필요하다고 판단되면 사용자에게 먼저 물어볼 것

## LR-002: 아키텍처 방향 인식 필수 — 로컬 우선, Azure 레거시 (2026-04-13)

- [HARD] 이 프로젝트의 TTS 런타임은 **로컬 Docker tts-proxy** (Mac, `100.107.208.106:5051`)
- [HARD] `src/functions/` (Azure Functions)는 **레거시 코드** — 적극적으로 유지보수하지 않음
- [HARD] Azure 배포 실패를 "수정해야 할 버그"로 취급 금지 — 로컬 전환의 자연스러운 결과임
- [HARD] Azure Functions의 `authLevel: 'function'`은 보안 강화 의도 — 'anonymous'로 롤백 금지
- [HARD] GitHub Actions 배포 워크플로우는 비활성화 상태 유지 (수동 dispatch만 가능)
- 코드 변경 시 영향 범위를 반드시 "로컬 tts-proxy 기준"으로 판단할 것
- Azure 관련 에러를 발견해도 로컬 경로에 영향이 없으면 우선순위 하

## LR-003: 회귀분석 시 아키텍처 컨텍스트 우선 확인 (2026-04-13)

- [HARD] 버그 수정/회귀분석 전에 반드시 "이 변경이 현재 활성 아키텍처(로컬)에 영향을 주는가?" 확인
- [HARD] 비활성 경로(Azure)의 문제를 활성 경로(로컬)의 문제와 동일 우선순위로 취급 금지
- 에러 메일/CI 실패를 받아도 "이 배포 경로가 현재 사용 중인가?"를 먼저 질문할 것
- 수정 방향이 프로젝트의 진화 방향(로컬화, 보안 강화)과 일치하는지 반드시 검증
- 근거: Azure 배포 DNS 실패를 "수정해야 할 문제"로 판단 → authLevel 보안 강화를 롤백 → 방향 역행

## LR-004: 재생 로직 버그 수정 시 전체 흐름 선행 감사 필수 (2026-04-14)

- [HARD] tts-engine/view.js의 재생 관련 버그를 수정할 때, 단발적 코드 패치를 제안하지 않음
- [HARD] 반드시 아래 전체 재생 흐름을 먼저 읽고 상호작용을 이해한 뒤 수정안을 제시할 것:
  1. `speakNoteWithServerCache` — 초기 재생 진입점 (cleanupAudioElement → resolveAudioCache → play)
  2. `setupAudioHandlers` — onended/onerror 핸들러 등록 (fast-play → inline fallback → last resort)
  3. `setupTimeupdateForElement` — timeupdate 기반 gapless 전환 (foreground Dual Audio vs background 위임)
  4. `prefetchNextTrack` — 다음 트랙 사전 로딩 (offline → server → memory)
  5. `visibilitychange` + `pause` 이벤트 — iOS 백그라운드 진입/복귀/OS 강제정지 처리
  6. `AudioPlaybackWatchdog` — 상태 불일치 감지 및 복구 (10초 주기, 5초 유예)
  7. `cleanupAudioElement` — 오디오 정지 + 핸들러 해제 (iOS 세션 파괴 위험)
- [HARD] 수정안은 위 7개 경로 간의 상호작용(특히 iOS 백그라운드에서의 오디오 세션 유지)을 고려해야 함
- 단일 핸들러만 보고 패치하면 다른 경로에서 회귀가 발생함 (예: onended catch에서 speakNote 호출 → cleanupAudioElement → iOS 세션 사망)
- 근거: 반복적인 단발 패치 → 회귀 → 재패치 사이클 발생
