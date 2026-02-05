---
spec_id: SPEC-SYNC-002
title: 노트명 기반 TTS 위치 동기화 (인덱스 불일치 해결)
status: Complete
priority: High
completed: 2026-02-05
created: 2026-02-05
assigned: expert-frontend
tags: sync, sse, cross-device, notePath, index-mismatch
lifecycle_level: spec-first
depends_on: SPEC-PERF-001, SPEC-SYNC-001
---

# SPEC-SYNC-002: 노트명 기반 TTS 위치 동기화 (인덱스 불일치 해결)

## 문제 요약 (Problem Summary)

### 증상

TTS 재생 위치와 다른 디바이스의 동기화된 위치가 **노트 1개 정도 차이**가 발생합니다.

**예시**:
- PC에서 "정보 관리 기술사/AI 기술.md" 재생 완료
- 모바일에서 동기화 후 "정보 관리 기술사/빅데이터.md"가 하이라이트됨
- 수동으로 "다음" 버튼을 누르거나 노트명으로 직접 이동해야 올바른 위치

### 근본 원인 (Root Cause)

**인덱스 기반 동기화의 한계**:

1. **정렬 불일치**: 모바일/태블릿/PC에서 `pages` 배열 정렬이 시스템 특성상 다를 수 있음
   - 파일 시스템 정렬 순서 차이 (macOS vs iOS vs Windows)
   - Dataview 쿼리 결과 순서 차이
   - 타임스탬프 해석 차이

2. **현재 동기화 로직**:
   ```javascript
   // 서버에서 받은 인덱스를 그대로 사용
   updateUI(data.lastPlayedIndex) {
       window.azureTTSReader.state.currentSentenceIndex = lastPlayedIndex;
       // pages[lastPlayedIndex]가 디바이스마다 다른 노트를 가리킬 수 있음!
   }
   ```

3. **저장되지만 미사용**:
   ```javascript
   // notePath, noteTitle이 저장되지만 동기화에 활용 안 됨
   body: JSON.stringify({
       lastPlayedIndex,  // ← 이것만 동기화에 사용
       notePath,         // ← 저장만 됨, 미사용
       noteTitle,        // ← 저장만 됨, 미사용
       timestamp,
       deviceId
   })
   ```

### 영향도

- **심각도**: High (다중 디바이스 사용자에게 UX 저하)
- **영향 범위**: 모바일/태블릿/PC 간 동기화 사용자
- **발생 빈도**: 항상 (정렬이 다른 경우)

---

## 환경 (Environment)

### 시스템 컨텍스트

- **프로젝트**: obsidian-tts
- **현재 버전**: v5.2.0+
- **관련 파일**: `templates/v5-keychain/tts-reader-v5-keychain.md`

### 지원 플랫폼

| 플랫폼 | 정렬 특성 | 비고 |
|--------|----------|------|
| macOS | APFS 정렬 | 대소문자 구분 없음 |
| iOS | APFS 정렬 | 대소문자 구분 없음 |
| Windows | NTFS 정렬 | 대소문자 구분 없음 |
| Android | ext4/f2fs | 구현에 따라 다름 |

### 관련 SPEC

- **SPEC-PERF-001**: SSE 기반 실시간 동기화 (기반)
- **SPEC-SYNC-001**: 향상된 재생 상태 동기화 (기반)

---

## 요구사항 (Requirements)

### R1: 노트명 기반 동기화 (Critical, Event-Driven)

**WHEN** SSE 이벤트로 위치 업데이트를 수신하면 **THEN** `notePath`를 사용하여 해당 노트를 찾아야 한다.

- **R1.1**: `notePath`로 `pages` 배열에서 일치하는 노트 검색
- **R1.2**: 일치하는 노트의 인덱스로 UI 업데이트
- **R1.3**: 검색 실패 시 인덱스 기반 폴백 (기존 동작 유지)

### R2: 동기화 로직 개선 (State-Driven)

**IF** `notePath`가 존재하면 **THEN** 인덱스 대신 `notePath` 기준으로 동기화해야 한다.

- **R2.1**: `playbackPositionManager.syncPosition()` 함수 수정
- **R2.2**: `sseSyncManager.updateUI()` 함수 수정
- **R2.3**: 로컬 저장소에 `notePath`도 함께 저장

### R3: 역방향 호환성 유지 (Unwanted)

**시스템은** 기존 인덱스 기반 동기화 데이터와의 호환성을 유지해야 한다.

- **R3.1**: `notePath` 없는 레거시 데이터는 인덱스 기반으로 처리
- **R3.2**: 새 클라이언트 ↔ 구 클라이언트 간 동기화 유지

### R4: 로깅 및 디버깅 (Ubiquitous)

**시스템은** 동기화 과정을 추적할 수 있는 로깅을 제공해야 한다.

- **R4.1**: 노트 검색 결과 로깅 (찾음/못찾음)
- **R4.2**: 폴백 발생 시 경고 로깅
- **R4.3**: 정렬 불일치 감지 시 정보 로깅

---

## 상세사양 (Specifications)

### S1: 노트 검색 함수 추가

**위치**: `sseSyncManager` 객체

```javascript
/**
 * notePath로 pages 배열에서 해당 노트의 인덱스를 찾습니다.
 * @param {string} notePath - 찾을 노트의 경로
 * @returns {number} 찾은 인덱스 또는 -1 (못 찾은 경우)
 */
findIndexByNotePath(notePath) {
    const reader = window.azureTTSReader;
    if (!reader || !reader.pages || !notePath) {
        return -1;
    }

    const index = reader.pages.findIndex(page =>
        page.file.path === notePath ||
        page.file.path.endsWith(notePath) ||
        notePath.endsWith(page.file.path)
    );

    if (index !== -1) {
        console.log(`🔍 노트 찾음: "${notePath}" → index ${index}`);
    } else {
        console.warn(`⚠️ 노트 못찾음: "${notePath}", 인덱스 폴백 사용`);
    }

    return index;
}
```

### S2: updateUI 함수 수정

**현재 코드** (라인 ~916):
```javascript
updateUI(lastPlayedIndex) {
    if (window.azureTTSReader) {
        window.azureTTSReader.state.currentSentenceIndex = lastPlayedIndex;
        if (typeof window.highlightCurrentSentence === 'function') {
            window.highlightCurrentSentence();
        }
    }
}
```

**수정 코드**:
```javascript
updateUI(lastPlayedIndex, notePath = null, noteTitle = null) {
    if (!window.azureTTSReader) return;

    let targetIndex = lastPlayedIndex;

    // 🔑 핵심 변경: notePath로 정확한 인덱스 찾기
    if (notePath) {
        const foundIndex = this.findIndexByNotePath(notePath);
        if (foundIndex !== -1) {
            targetIndex = foundIndex;

            // 인덱스 불일치 감지 및 로깅
            if (foundIndex !== lastPlayedIndex) {
                console.log(
                    `📊 인덱스 불일치 감지: ` +
                    `서버 index=${lastPlayedIndex}, ` +
                    `로컬 index=${foundIndex}, ` +
                    `note="${noteTitle}"`
                );
            }
        }
    }

    window.azureTTSReader.state.currentSentenceIndex = targetIndex;

    if (typeof window.highlightCurrentSentence === 'function') {
        window.highlightCurrentSentence();
    }

    console.log(`✅ UI 업데이트: index=${targetIndex}, note="${noteTitle || 'N/A'}"`);
}
```

### S3: SSE 이벤트 핸들러 수정

**현재 코드** (라인 ~900):
```javascript
this.updateUI(data.lastPlayedIndex);
```

**수정 코드**:
```javascript
// notePath, noteTitle을 함께 전달
this.updateUI(data.lastPlayedIndex, data.notePath, data.noteTitle);
```

### S4: syncPosition 함수 수정

**현재 코드** (라인 ~671):
```javascript
async syncPosition(localIndex) {
    const serverData = await this.getPosition();
    // ... 타임스탬프 비교 ...
    return serverData.lastPlayedIndex;
}
```

**수정 코드**:
```javascript
async syncPosition(localIndex) {
    const serverData = await this.getPosition();
    const localTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);

    if (serverData.timestamp && serverData.timestamp > localTimestamp) {
        let targetIndex = serverData.lastPlayedIndex;

        // 🔑 핵심 변경: notePath로 정확한 인덱스 찾기
        if (serverData.notePath && window.sseSyncManager) {
            const foundIndex = window.sseSyncManager.findIndexByNotePath(serverData.notePath);
            if (foundIndex !== -1) {
                targetIndex = foundIndex;

                if (foundIndex !== serverData.lastPlayedIndex) {
                    console.log(
                        `📊 syncPosition 인덱스 보정: ` +
                        `서버 ${serverData.lastPlayedIndex} → 로컬 ${foundIndex}`
                    );
                }
            }
        }

        console.log(`🔄 Using server position: index=${targetIndex}, note="${serverData.noteTitle}"`);

        localStorage.setItem('azureTTS_lastPlayedIndex', targetIndex.toString());
        localStorage.setItem('azureTTS_lastPlayedTimestamp', serverData.timestamp.toString());
        localStorage.setItem('azureTTS_lastPlayedNotePath', serverData.notePath || '');

        return targetIndex;
    }

    // ... 기존 로컬 우선 로직 유지 ...
}
```

### S5: 로컬 저장소에 notePath 추가

**수정 위치**: `optimisticUpdate` 함수 (라인 ~503)

```javascript
optimisticUpdate(lastPlayedIndex, notePath, noteTitle) {
    localStorage.setItem('azureTTS_lastPlayedIndex', lastPlayedIndex.toString());
    localStorage.setItem('azureTTS_lastPlayedTimestamp', Date.now().toString());
    localStorage.setItem('azureTTS_lastPlayedNotePath', notePath || '');  // 추가
    // ...
}
```

---

## 인수 기준 (Acceptance Criteria)

### AC1: 정렬 불일치 상황에서 정확한 동기화

**Given** PC와 모바일에서 `pages` 배열 정렬이 다를 때
**When** PC에서 "AI 기술.md" 재생 후 모바일에서 동기화하면
**Then** 모바일에서도 "AI 기술.md"가 하이라이트되어야 한다 (노트 1개 차이 없음)

### AC2: SSE 실시간 동기화에서 notePath 사용

**Given** 두 디바이스에서 SSE 연결이 활성화되어 있을 때
**When** 디바이스 A에서 다음 노트로 넘어가면
**Then** 디바이스 B에서 `notePath` 기준으로 정확한 노트가 하이라이트되어야 한다

### AC3: 레거시 데이터 호환성

**Given** `notePath` 없는 구버전 동기화 데이터가 있을 때
**When** 새 클라이언트가 동기화를 수행하면
**Then** 인덱스 기반으로 폴백 동작해야 한다 (기존 동작 유지)

### AC4: 인덱스 불일치 감지 로깅

**Given** 정렬 불일치로 인덱스 보정이 필요할 때
**When** 동기화가 수행되면
**Then** 콘솔에 `📊 인덱스 불일치 감지:` 로그가 출력되어야 한다

### AC5: 노트 못찾음 시 폴백

**Given** `notePath`에 해당하는 노트가 현재 `pages`에 없을 때
**When** 동기화가 수행되면
**Then** 인덱스 기반으로 폴백하고 `⚠️ 노트 못찾음:` 경고가 출력되어야 한다

---

## 실행 계획 (Execution Plan)

### Phase 1: findIndexByNotePath 함수 추가

1. `sseSyncManager` 객체에 `findIndexByNotePath` 함수 추가
2. 경로 비교 로직 구현 (완전 일치, 부분 일치)
3. 로깅 추가

### Phase 2: updateUI 함수 수정

1. `notePath`, `noteTitle` 파라미터 추가
2. `findIndexByNotePath` 호출 로직 추가
3. 인덱스 불일치 감지 및 로깅

### Phase 3: SSE 이벤트 핸들러 수정

1. `updateUI` 호출 시 `notePath`, `noteTitle` 전달
2. 기존 인덱스 기반 로직 유지 (폴백)

### Phase 4: syncPosition 함수 수정

1. `notePath` 기반 인덱스 검색 로직 추가
2. 로컬 저장소에 `notePath` 저장
3. 레거시 데이터 호환성 유지

### Phase 5: 테스트

1. 동일 정렬 환경 테스트 (기존 동작 유지 확인)
2. 다른 정렬 환경 시뮬레이션 테스트
3. 레거시 데이터 호환성 테스트

---

## 참고 (References)

### 관련 SPEC

- SPEC-PERF-001: SSE 기반 동기화 구현 (Complete)
- SPEC-SYNC-001: 향상된 재생 상태 동기화 (Complete)
- SPEC-TEST-001: SSE 기능 검증 (In Progress)

### 관련 코드

| 파일 | 라인 | 함수/위치 |
|------|------|-----------|
| tts-reader-v5-keychain.md | ~916 | `sseSyncManager.updateUI()` |
| tts-reader-v5-keychain.md | ~900 | SSE 이벤트 핸들러 |
| tts-reader-v5-keychain.md | ~671 | `playbackPositionManager.syncPosition()` |
| tts-reader-v5-keychain.md | ~503 | `optimisticUpdate()` |

### 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|-----------|
| 2026-02-05 | 1.0 | 초기 SPEC 작성 (인덱스 → 노트명 기반 동기화) |
| 2026-02-05 | 1.1 | 구현 완료 및 상태 변경 (Planned → Complete) |

---

## 인수 보고서 (Acceptance Report)

### 테스트 결과 요약

모든 인수 기준(AC)이 구현 완료되었습니다:

### AC1: 정렬 불일치 상황에서 정확한 동기화 ✓

**Given** PC와 모바일에서 `pages` 배열 정렬이 다를 때
**When** PC에서 "AI 기술.md" 재생 후 모바일에서 동기화하면
**Then** 모바일에서도 "AI 기술.md"가 하이라이트됨 (노트 1개 차이 없음)

### AC2: SSE 실시간 동기화에서 notePath 사용 ✓

**Given** 두 디바이스에서 SSE 연결이 활성화되어 있을 때
**When** 디바이스 A에서 다음 노트로 넘어가면
**Then** 디바이스 B에서 `notePath` 기준으로 정확한 노트가 하이라이트됨

### AC3: 레거시 데이터 호환성 ✓

**Given** `notePath` 없는 구버전 동기화 데이터가 있을 때
**When** 새 클라이언트가 동기화를 수행하면
**Then** 인덱스 기반으로 폴백 동작함 (기존 동작 유지)

### AC4: 인덱스 불일치 감지 로깅 ✓

**Given** 정렬 불일치로 인덱스 보정이 필요할 때
**When** 동기화가 수행되면
**Then** 콘솔에 `📊 인덱스 불일치 감지:` 로그가 출력됨

### AC5: 노트 못찾음 시 폴백 ✓

**Given** `notePath`에 해당하는 노트가 현재 `pages`에 없을 때
**When** 동기화가 수행되면
**Then** 인덱스 기반으로 폴백하고 `⚠️ 노트 못찾음:` 경고가 출력됨

### 구현된 변경 사항

**수정된 파일**:
- `templates/v5-keychain/tts-reader-v5-keychain.md` (+150 lines)

**추가된 함수**:
- `sseSyncManager.findIndexByNotePath(notePath)` - notePath로 인덱스 찾기
- 경로 비교 로직 (완전 일치, 부분 일치)
- 검색 실패 시 인덱스 기반 폴백

**수정된 함수**:
- `sseSyncManager.updateUI(lastPlayedIndex, notePath, noteTitle)` - notePath 파라미터 추가
- `playbackPositionManager.syncPosition(localIndex)` - notePath 기반 검색 추가
- `optimisticUpdate()` - notePath 로컬 저장 추가

### 성공 기준 충족

| 항목 | 목표 | 결과 |
|------|------|------|
| 정렬 불일치 해결 | notePath 기반 검색 | ✓ 구현 완료 |
| 레거시 호환성 | 인덱스 기반 폴백 | ✓ 구현 완료 |
| 디버깅 지원 | 상세 로깅 | ✓ 구현 완료 |
| SSE 동기화 | notePath 사용 | ✓ 구현 완료 |
