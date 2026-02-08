# SPEC-OBSIDIAN-TTSV5-SYNC-002

## Metadata

- **ID**: SPEC-OBSIDIAN-TTSV5-SYNC-002
- **Title**: TTS v5 Position Synchronization Index Consistency and Race Condition Fix
- **Created**: 2026-02-04
- **Status**: Planned
- **Priority**: High
- **Assigned**: manager-ddd
- **Related SPECs**: SPEC-OBSIDIAN-TTSV5-SYNC-001

---

## Environment

### Technical Stack

- **Frontend**: Obsidian DataviewJS, Vanilla JavaScript
- **Storage**:
  - LocalStorage (local state)
  - Azure Function API (playback position sync)
- **Server**: Azure Function API (M4 Pro backend)
- **TTS**: Azure Cognitive Services Speech API

### Related Files

- `views/tts-position/view.js`: playbackPositionManager (savePosition to server)
- `views/integrated-ui/view.js`: TTSAutoMoveManager (poll server every 6 seconds)
- `views/scroll-manager/view.js`: scrollPositionManager
- `views/tts-engine/view.js`: speakNoteWithServerCache()
- `1_Project/특허_출제예상_보유/999_특허보유_자료/1_Dataview 전산/TTS 출제예상 읽기 v5 (Keychain).md`: TTS Player Note
- `1_Project/특허_출제예상_보유/999_특허보유_자료/1_Dataview 전산/기술사_출제예상 (통합, 서버동기화, 최적화).md`: Integrated Note

---

## Assumptions

1. **Note List Consistency**: Two notes may have different `currentPageNames` arrays
2. **Server Timezone**: M4 Pro server may have timezone discrepancies
3. **Network Reliability**: Server API endpoints respond reliably within expected timeout
4. **Single User System**: One user using multiple notes/views simultaneously
5. **StateLock Pattern**: StateLock exists but may not cover all race condition scenarios

---

## Requirements

### R1: Index vs Title Matching Consistency (Priority: High)

**EARS Format**: WHEN 시스템이 TTS 재생 위치를 동기화할 때, THEN 인덱스 기반 일치를 우선하고 제목 기반 일치를 보조 매칭으로 사용해야 한다.

**Detailed Requirements**:
- R1.1: `lastPlayedIndex`를 기본 위치 매칭 키로 사용
- R1.2: `noteTitle` 매칭은 보조 수단으로만 사용 (인덱스 범위 검증 후)
- R1.3: 인덱스가 두 노트 모두 유효한 범위 내에 있는지 검증
- R1.4: 제목 매칭 실패 시 인덱스 기반 위치 복원
- R1.5: 일치 실패 시 명확한 에러 메시지와 로깅

### R2: Server Timestamp Validation Graceful Handling (Priority: High)

**EARS Format**: WHEN 서버 타임스탬프가 미래 시간인 경우, THEN 시스템은 동기화를 거부하지 않고 현재 시간으로 조정하여 저장해야 한다.

**Detailed Requirements**:
- R2.1: 서버 타임스탬프가 현재 시간 + 허용 오차(초과)인지 감지
- R2.2: 미래 시간스탬프 감지 시 현재 클라이언트 시간으로 대체
- R2.3: 타임스탬프 조정 사항을 로깅
- R2.4: 서버 타임존 차이로 인한 모든 동기화 무시 방지
- R2.5: 허용 오차 설정 가능 (기본값: 5분)

### R3: Race Condition Prevention (Priority: High)

**EARS Format**: WHEN 수동 TTS 위치 버튼 클릭과 자동 이동 타이머 폴링이 동시에 발생할 때, THEN 시스템은 StateLock 패턴을 통해 충돌을 방지해야 한다.

**Detailed Requirements**:
- R3.1: StateLock이 모든 위치 업데이트 경로에서 적용되도록 확장
- R3.2: 수동 클릭 우선순위가 자동 폴링보다 높음
- R3.3: 진행 중인 동기화 작업 취소 및 재시작 메커니즘
- R3.4: 중복 스크롤 호출 방지 (debounce)
- R3.5: Race condition 발생 시 명확한 로깅

### R4: Position Sync Status Visibility (Priority: Medium)

**EARS Format**: THE 시스템은 사용자에게 현재 동기화 상태를 명확하게 표시해야 한다.

**Detailed Requirements**:
- R4.1: 동기화 상태 표시 (유휴/진행 중/성공/실패)
- R4.2: 마지막 동기화 시간 표시
- R4.3: 인덱스 vs 제목 일치 결과 표시
- R4.4: 타임스탬프 조정 경고 표시

---

## Specifications

### S1: Index-First Position Matching

**Current Implementation Analysis**:
- `views/integrated-ui/view.js` attempts `noteTitle` matching first
- Falls back to raw `lastPlayedIndex` if no match
- Problem: Different `currentPageNames` arrays cause mismatches

**Improvement Plan**:
1. Change matching priority: Index-first, Title-second
2. Validate index bounds before applying
3. Use title matching only for confirmation, not primary lookup
4. Add fallback logic for index out of bounds

### S2: Timestamp Adjustment Strategy

**Current Implementation Analysis**:
- Server timestamp validation rejects syncs if timestamp is too far in future
- M4 Pro server timezone issues cause all syncs to be ignored

**Improvement Plan**:
1. Detect future timestamps using `Date.now()` comparison
2. Replace future timestamps with current client time
3. Log all timestamp adjustments
4. Configurable tolerance threshold (default: 5 minutes)
5. Apply to both `savePosition()` and `TTSAutoMoveManager`

### S3: StateLock Enhancement

**Current Implementation Analysis**:
- StateLock exists but may not cover all scenarios
- Manual click and auto-move timer can conflict

**Improvement Plan**:
1. Extend StateLock to cover all position update paths
2. Implement priority system: Manual > Auto
3. Add debounce for scroll operations (300ms)
4. Cancel in-progress sync when manual update triggered
5. Add comprehensive race condition logging

### S4: Sync Status UI

**Implementation Plan**:
1. Add status indicator component in integrated note
2. Show: "Sync Status: [Idle/Syncing/Success/Failed]"
3. Display last sync time with timezone
4. Show match result: "Matched by index [5] vs title [기술사_출제예상_제목]"
5. Warn on timestamp adjustment

---

## Traceability

| Requirement | Specification | Files Affected |
|-------------|---------------|----------------|
| R1 | S1 | views/integrated-ui/view.js, views/tts-position/view.js |
| R2 | S2 | views/tts-position/view.js, views/integrated-ui/view.js |
| R3 | S3 | views/integrated-ui/view.js, views/scroll-manager/view.js |
| R4 | S4 | views/integrated-ui/view.js |

---

## TAGS

```
#spec #obsidian #tts #synchronization #race-condition #timestamp #index-matching #v5.4.0
```
