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
