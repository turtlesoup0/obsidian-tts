# SPEC-OBSIDIAN-TTS-IMPROVEMENT-001

## TTS 시스템 통합 개선 계획

**상태**: Draft
**생성일**: 2026-02-05
**대상 파일**: views/integrated-ui/view.js, views/tts-engine/view.js, views/tts-position/view.js, views/tts-ui/view.js, views/tts-cache/view.js, views/tts-config/view.js
**방법론**: DDD (ANALYZE-PRESERVE-IMPROVE)

---

## 1. 현황 요약

### 1.1 시스템 구성

| 뷰 파일 | 줄 수 | 역할 |
|---------|-------|------|
| `tts-config/view.js` | 283 | 설정 로드, API 키, 엔드포인트 관리 |
| `tts-engine/view.js` | ~1750 | TTS 재생 엔진, 오디오 상태 머신 |
| `tts-position/view.js` | ~285 | 재생 위치 서버 동기화 |
| `tts-cache/view.js` | 489 | 이중 캐시 (IndexedDB + Azure Blob) |
| `tts-ui/view.js` | 994 | TTS 제어 UI, 캐시 통계, 일괄 생성 |
| `integrated-ui/view.js` | ~1100 | 통합노트 UI, 자동이동, 검색 필터 |

### 1.2 모듈 파일

| 모듈 | 위치 | 로드 상태 |
|------|------|----------|
| `common/device-id.js` | 25줄 | ❌ ERR_FILE_NOT_FOUND |
| `common/fetch-helpers.js` | 37줄 | ❌ ERR_FILE_NOT_FOUND |
| `common/ui-helpers.js` | 49줄 | ❌ ERR_FILE_NOT_FOUND |
| `integrated-ui/modules/state-lock.js` | 34줄 | ❌ ERR_FILE_NOT_FOUND |
| `integrated-ui/modules/api-throttle.js` | 45줄 | ❌ ERR_FILE_NOT_FOUND |
| `integrated-ui/modules/auto-move-manager.js` | 50줄 | ❌ ERR_FILE_NOT_FOUND |
| `integrated-ui/modules/debug-panel.js` | 65줄 | ❌ 삭제 대상 |

**근본 원인**: Obsidian의 `dv.view()`는 `new Function()`으로 JS를 실행. `<script src="relative/path">` 태그는 `app://obsidian.md/`로 resolve되어 **항상 실패**.

### 1.3 핵심 문제

| # | 심각도 | 문제 | 위치 |
|---|--------|------|------|
| C1 | **CRITICAL** | 자동이동 폴링 함수 미구현 | integrated-ui:866 |
| C2 | **CRITICAL** | 모든 모듈 로드 실패 (인라인 fallback 필요) | integrated-ui:31-36 |
| C3 | **HIGH** | `ttsAutoMoveStateLock` 인스턴스 미생성 | integrated-ui 전체 |
| C4 | **HIGH** | 토글 핸들러 StateLock 무조건 호출 (null이면 crash) | integrated-ui:877 |
| C5 | **MEDIUM** | 디버그 패널 ~40곳 참조 제거 필요 | integrated-ui 전체 |
| C6 | **MEDIUM** | tts-ui null 체크 누락 (`azureTTSReader`) | tts-ui:7 |
| C7 | **LOW** | APIThrottle 실제 미사용 (주석에만 존재) | integrated-ui:805 |

---

## 2. 개선 계획 — 4개 Phase

### Phase 1: 모듈 인라인화 + 자동이동 구현 (Critical)

**대상**: `views/integrated-ui/view.js` (1개 파일)
**위임 에이전트**: expert-refactoring 또는 expert-frontend

#### Task 1.1: 디버그 패널 완전 제거

**변경 내용**:
- `loadScript('views/integrated-ui/modules/debug-panel.js')` 제거 (34줄)
- 모든 `window.ttsDebugPanel` 참조 제거 (~40곳)
- 파일 상단 디버그 패널 주석 블록 제거 (8-11줄)
- 파일 하단 디버그 활성화 안내 주석 제거 (1092-1097줄)

**제거 대상 패턴**:
```javascript
// 삭제: 조건부 블록 전체
if (window.ttsDebugPanel) {
    window.ttsDebugPanel.log('...', '...');
    window.ttsDebugPanel.updateLayoutMode(...);
    window.ttsDebugPanel.updateStats();
    window.ttsDebugPanel.updateTableStatus(...);
}
```

#### Task 1.2: 인라인 fallback 추가

**변경 위치**: 52-55줄 (기존 "모듈로 이동됨" 주석 대체)

```javascript
// ============================================
// 인라인 fallback: 모듈 로드 실패 대비 (Obsidian app:// 프로토콜 제한)
// ============================================

// StateLock: 상태 변경 Race Condition 방지
if (!window.StateLock) {
    window.StateLock = class StateLock {
        constructor() {
            this.locked = false;
            this.currentOwner = null;
        }
        async acquire(owner) {
            const maxWait = 5000; // 5초 타임아웃
            const start = Date.now();
            while (this.locked) {
                if (this.currentOwner === 'auto-polling' && owner === 'manual-click') {
                    this.locked = false;
                }
                if (Date.now() - start > maxWait) {
                    window.ttsLog?.('⚠️ [StateLock] acquire 타임아웃, 강제 해제');
                    this.locked = false;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            this.locked = true;
            this.currentOwner = owner;
        }
        release() {
            this.locked = false;
            this.currentOwner = null;
        }
    };
}

// TTSAutoMoveManager: 자동이동 타이머 관리
if (!window.TTSAutoMoveManager) {
    window.TTSAutoMoveManager = class TTSAutoMoveManager {
        constructor(noteId, config) {
            this.noteId = noteId;
            this.config = config || {};
            this.timerId = null;
            this.isRunning = false;
            this.lastPosition = { index: -1, name: '' };
        }
        start(pollingFn) {
            if (this.isRunning) return;
            this.isRunning = true;
            const interval = this.config.pollInterval || 5000;
            this.timerId = setInterval(pollingFn, interval);
            window.ttsLog?.(`▶️ [AutoMove] Started for ${this.noteId}, interval=${interval}ms`);
        }
        stop() {
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
            this.isRunning = false;
            window.ttsLog?.(`⏸️ [AutoMove] Stopped for ${this.noteId}`);
        }
        setUIRefs(statusSpan, rows, scrollToRow) {
            this.statusSpan = statusSpan;
            this.rows = rows;
            this.scrollToRow = scrollToRow;
        }
        setupCleanupHandlers(container) {
            this.cleanupContainer = container;
        }
        cleanup() {
            this.stop();
            window.ttsAutoMoveTimers?.delete(this.noteId);
        }
    };
}

// StateLock 인스턴스 생성
if (!window.ttsAutoMoveStateLock) {
    window.ttsAutoMoveStateLock = new window.StateLock();
    window.ttsLog?.('✅ ttsAutoMoveStateLock 인스턴스 생성');
}
```

#### Task 1.3: 자동이동 폴링 함수 구현 (핵심)

**문제**: `autoMoveManager.start()` 호출 시 폴링 함수를 전달하지 않음
**위치**: integrated-ui/view.js 862-866줄

**현재 코드**:
```javascript
// 862줄
if (isEnabled) {
    window.ttsLog('🎬 [TTS Auto-Move] 자동 모니터링 시작');
    autoMoveManager.start();  // ❌ 폴링 함수 없음
}
```

**수정 설계**:
```javascript
// 폴링 함수 정의 (autoMoveManager 생성 전에 위치)
const pollTTSPosition = async () => {
    try {
        const ttsData = await getTTSPosition();
        if (!ttsData || ttsData.index < 0) return;

        // 이전 위치와 같으면 스킵
        if (autoMoveManager.lastPosition.index === ttsData.index) return;

        // 위치 업데이트
        autoMoveManager.lastPosition = { index: ttsData.index, name: ttsData.noteTitle || '' };

        // 유효 범위 확인
        if (ttsData.index >= rows.length) {
            window.ttsLog?.(`⚠️ [AutoMove] index ${ttsData.index} out of range (max: ${rows.length - 1})`);
            return;
        }

        // 자동 스크롤
        scrollToRow(rows[ttsData.index]);
        window.ttsLog?.(`🔄 [AutoMove] 자동 이동: index=${ttsData.index}, note="${ttsData.noteTitle}"`);

        // 상태 표시 업데이트
        if (ttsStatusSpan) {
            ttsStatusSpan.style.color = '#4CAF50';
            ttsStatusSpan.textContent = '●';
        }
    } catch (error) {
        window.ttsLog?.(`❌ [AutoMove] 폴링 오류: ${error.message}`);
    }
};

// autoMoveManager.start() 호출 시 폴링 함수 전달
if (isEnabled) {
    window.ttsLog('🎬 [TTS Auto-Move] 자동 모니터링 시작');
    autoMoveManager.start(pollTTSPosition);
}
```

**토글 핸들러 수정** (871-908줄):
```javascript
ttsToggleSwitch.onclick = async (event) => {
    const currentState = ttsToggleSwitch.classList.contains('active');
    const newState = !currentState;

    // StateLock 조건부 사용
    const hasStateLock = !!window.ttsAutoMoveStateLock;
    try {
        if (hasStateLock) await window.ttsAutoMoveStateLock.acquire('toggle');

        if (newState) {
            ttsToggleSwitch.classList.add('active');
            localStorage.setItem('ttsAutoMoveEnabled', 'true');
            ttsStatusSpan.style.color = '#4CAF50';
            ttsStatusSpan.textContent = '●';
            await gotoTTSPosition();
            if (autoMoveManager && !autoMoveManager.isRunning) {
                autoMoveManager.start(pollTTSPosition);  // ✅ 폴링 함수 전달
            }
        } else {
            ttsToggleSwitch.classList.remove('active');
            localStorage.setItem('ttsAutoMoveEnabled', 'false');
            ttsStatusSpan.style.color = '#888';
            ttsStatusSpan.textContent = '○';
            if (autoMoveManager && autoMoveManager.isRunning) {
                autoMoveManager.stop();
            }
        }
    } finally {
        if (hasStateLock) window.ttsAutoMoveStateLock.release();
    }
};
```

#### Task 1.4: loadScript 호출 정리

**변경**: 디버그 패널 + APIThrottle(미사용) loadScript 제거

```javascript
// 변경 전 (31-36줄)
await loadScript('views/integrated-ui/modules/state-lock.js');
await loadScript('views/integrated-ui/modules/api-throttle.js');
await loadScript('views/integrated-ui/modules/auto-move-manager.js');
await loadScript('views/integrated-ui/modules/debug-panel.js');

// 변경 후 (모듈 로드 시도는 유지하되, 불필요한 것 제거)
await loadScript('views/integrated-ui/modules/state-lock.js');
await loadScript('views/integrated-ui/modules/auto-move-manager.js');
// api-throttle.js: view.js에서 직접 사용하지 않으므로 제거
// debug-panel.js: 삭제
```

---

### Phase 2: 뷰 간 정합성 강화

**대상**: `views/tts-engine/view.js`, `views/tts-position/view.js` (2개 파일)
**위임 에이전트**: expert-backend 또는 expert-refactoring

#### Task 2.1: tts-engine → integrated-ui 위치 변경 알림

**현재 문제**: tts-engine에서 재생 위치가 바뀌면 `playbackPositionManager.savePosition()`으로 서버에 저장하지만, integrated-ui는 폴링으로만 이를 감지함 (6초 지연).

**개선 설계**: CustomEvent 기반 즉시 알림 추가

**tts-engine/view.js 변경**:
```javascript
// speakNoteWithServerCache() 내 재생 완료 후 (위치 저장 직후)
window.dispatchEvent(new CustomEvent('tts-position-changed', {
    detail: { index: currentIndex, noteTitle: currentNote.file.name }
}));
```

**integrated-ui/view.js 변경** (pollTTSPosition 근처):
```javascript
// CustomEvent 리스너로 즉시 반응
window.addEventListener('tts-position-changed', (event) => {
    const { index, noteTitle } = event.detail;
    if (index >= 0 && index < rows.length) {
        autoMoveManager.lastPosition = { index, name: noteTitle };
        scrollToRow(rows[index]);
        window.ttsLog?.(`⚡ [AutoMove] 즉시 이동: index=${index}`);
    }
});
```

**효과**: 6초 폴링 지연 → 즉시 반응 (폴링은 fallback으로 유지)

#### Task 2.2: tts-position 로컬 모드 정합성

**현재 문제**: `getPosition()`이 로컬 모드에서 `{ lastPlayedIndex: -1, timestamp: 0 }` 반환 → integrated-ui의 `getTTSPosition()`이 항상 실패.

**개선 설계**: 로컬 모드에서 localStorage 기반 위치 반환
```javascript
// tts-position/view.js getPosition() 수정
if (window.ttsModeConfig?.features?.positionSync === 'local') {
    const savedIndex = parseInt(localStorage.getItem('azureTTS_lastPlayedIndex') || '-1', 10);
    const savedTimestamp = parseInt(localStorage.getItem('azureTTS_lastPlayedTimestamp') || '0', 10);
    const savedTitle = localStorage.getItem('azureTTS_lastPlayedTitle') || '';
    window.ttsLog(`📱 로컬 모드 - localStorage 위치 반환: index=${savedIndex}`);
    return { lastPlayedIndex: savedIndex, timestamp: savedTimestamp, noteTitle: savedTitle };
}
```

#### Task 2.3: window.azureTTSReader null 체크 통합

**대상**: tts-ui/view.js
**현재 문제**: `window.azureTTSReader` 접근 시 null 체크 없이 프로퍼티 접근 (7줄 등)

**변경 패턴**:
```javascript
// 변경 전
const reader = window.azureTTSReader;
const totalChars = reader.totalCharsUsed;

// 변경 후
const reader = window.azureTTSReader;
if (!reader) { window.ttsLog?.('⚠️ azureTTSReader 미초기화'); return; }
const totalChars = reader.totalCharsUsed || 0;
```

---

### Phase 3: UI/UX 개선

**대상**: `views/integrated-ui/view.js`, `views/tts-ui/view.js` (2개 파일)
**위임 에이전트**: expert-frontend

#### Task 3.1: 자동이동 상태 피드백 강화

**현재**: 토글 ON/OFF만 표시 (● / ○)
**개선**: 폴링 상태, 마지막 동기화 시간, 오류 상태 표시

```
[ON]  ● 자동이동 (3초 전 동기화)
[OFF] ○ 자동이동
[ERR] ⚠ 자동이동 (서버 응답 없음)
```

**구현**:
```javascript
// pollTTSPosition 내부에서 상태 업데이트
if (ttsStatusSpan) {
    const now = new Date();
    ttsStatusSpan.title = `마지막 동기화: ${now.toLocaleTimeString()}`;
}
```

#### Task 3.2: 수동 이동 버튼 피드백 개선

**현재**: "🎙️ 확인 중..." → "🎙️ 노트제목" (성공) 또는 "🎙️ 위치 없음" (실패)
**개선**: 로딩 애니메이션, 에러 세분화, 자동 복구

```javascript
// 로딩 상태
ttsBtn.textContent = '🎙️ ⏳';
ttsBtn.style.opacity = '0.7';

// 성공
ttsBtn.textContent = `🎙️ ${ttsData.noteTitle}`;
ttsBtn.style.opacity = '1';

// 실패 세분화
if (error.message.includes('timeout')) {
    ttsBtn.textContent = '🎙️ 서버 응답 없음';
} else if (error.message.includes('network')) {
    ttsBtn.textContent = '🎙️ 네트워크 오류';
} else {
    ttsBtn.textContent = '🎙️ 위치 확인 실패';
}
```

#### Task 3.3: tts-ui 일괄 생성 진행률 개선

**현재**: 단순 카운터 (n/total)
**개선**: 예상 완료 시간, 속도 표시, 일시정지/재개

---

### Phase 4: 성능 최적화

**대상**: `views/tts-ui/view.js`, `views/integrated-ui/view.js` (2개 파일)
**위임 에이전트**: expert-performance

#### Task 4.1: 캐시 상태 일괄 조회

**현재**: N개 노트에 대해 N개 개별 요청 (Promise.all)
**개선**: 서버 API에 batch endpoint 추가 또는 클라이언트 측 쓰로틀링

```javascript
// 클라이언트 측 batch (서버 변경 없이)
const BATCH_SIZE = 10;
for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(page => updateCacheStatusForNote(page)));
    // 배치 간 100ms 대기
    await new Promise(resolve => setTimeout(resolve, 100));
}
```

#### Task 4.2: 폴링 최적화

**현재**: 고정 6초 간격 폴링
**개선**: 적응형 폴링 (변화 감지 시 간격 단축, 안정 시 확장)

```javascript
// 적응형 폴링
let pollInterval = 5000; // 기본 5초
const MIN_INTERVAL = 2000;
const MAX_INTERVAL = 15000;

// 위치 변화 감지 시
if (positionChanged) {
    pollInterval = Math.max(MIN_INTERVAL, pollInterval * 0.5);
} else {
    pollInterval = Math.min(MAX_INTERVAL, pollInterval * 1.2);
}
```

#### Task 4.3: StateLock busy-wait 개선

**현재**: 50ms 간격 while 루프 (CPU 낭비)
**개선**: Promise 기반 큐

```javascript
class StateLock {
    constructor() {
        this.locked = false;
        this.waitQueue = [];
    }
    acquire(owner) {
        if (!this.locked) {
            this.locked = true;
            this.currentOwner = owner;
            return Promise.resolve();
        }
        // manual-click이 auto-polling보다 우선
        if (this.currentOwner === 'auto-polling' && owner === 'manual-click') {
            this.locked = false;
            return this.acquire(owner);
        }
        return new Promise(resolve => this.waitQueue.push(resolve));
    }
    release() {
        if (this.waitQueue.length > 0) {
            this.waitQueue.shift()();
        } else {
            this.locked = false;
            this.currentOwner = null;
        }
    }
}
```

---

## 3. 구현 순서 및 위임 계획

| 순서 | Phase | Task | 대상 파일 (수) | 위임 에이전트 | 우선순위 |
|------|-------|------|-------------|-------------|---------|
| 1 | P1 | T1.1+T1.2+T1.3+T1.4 | integrated-ui (1) | expert-refactoring | **P0** |
| 2 | P2 | T2.1 | tts-engine + integrated-ui (2) | expert-backend | P1 |
| 3 | P2 | T2.2 | tts-position (1) | expert-backend | P1 |
| 4 | P2 | T2.3 | tts-ui (1) | expert-frontend | P1 |
| 5 | P3 | T3.1+T3.2 | integrated-ui (1) | expert-frontend | P2 |
| 6 | P3 | T3.3 | tts-ui (1) | expert-frontend | P2 |
| 7 | P4 | T4.1+T4.2+T4.3 | integrated-ui + tts-ui (2) | expert-performance | P3 |

**의존성**:
- Phase 2는 Phase 1 완료 후 진행 (자동이동 기반 필요)
- Phase 3은 Phase 1, 2와 독립적으로 진행 가능
- Phase 4는 Phase 1 완료 후 진행 (폴링 함수 필요)

---

## 4. 테스트 방법

### 4.1 Phase 1 테스트 (모듈 인라인화 + 자동이동)

#### 구문 검증
```bash
node --check views/integrated-ui/view.js
```

#### 콘솔 오류 검증 (Obsidian DevTools)
```
# 기대 결과: 아래 오류 모두 사라짐
- ❌ ERR_FILE_NOT_FOUND (state-lock, api-throttle, auto-move-manager, debug-panel)
- ❌ autoMoveManager is not defined
- ❌ TTSAutoMoveManager is not defined
- ❌ window.ttsDebugPanel 관련 오류

# 기대 로그:
- ✅ ttsAutoMoveStateLock 인스턴스 생성
- ✅ [TTS Auto-Move] Manager 생성 완료
- ▶️ [AutoMove] Started for ...
```

#### 자동이동 동작 테스트
1. 통합노트 열기
2. 자동이동 토글 ON 확인
3. TTS 노트에서 재생 시작
4. 통합노트에서 6초 이내 자동 스크롤 확인
5. TTS 재생 위치 변경 → 통합노트 자동 이동 확인
6. 자동이동 토글 OFF → 스크롤 중지 확인

#### 수동 이동 테스트
1. 🎙️ 버튼 클릭
2. "확인 중..." 표시 확인
3. 올바른 행으로 스크롤 확인
4. 노트 제목 표시 확인

#### 노트 전환 테스트
1. 통합노트 → 다른 노트 → 통합노트 (3회)
2. 매회 버튼 표시 확인
3. 자동이동 상태 유지 확인

### 4.2 Phase 2 테스트 (정합성)

#### CustomEvent 테스트
```javascript
// DevTools 콘솔에서 수동 테스트
window.dispatchEvent(new CustomEvent('tts-position-changed', {
    detail: { index: 5, noteTitle: '테스트 노트' }
}));
// 기대: 통합노트가 6번째 행으로 즉시 스크롤
```

#### 로컬 모드 위치 테스트
1. tts-config에서 로컬 모드 설정
2. TTS 재생 → 위치 저장 확인 (localStorage)
3. 통합노트에서 수동/자동 이동 → localStorage 위치 사용 확인

#### null 체크 테스트
1. tts-engine 로드 전 tts-ui 열기
2. 콘솔에 TypeError 없음 확인
3. azureTTSReader 초기화 후 정상 동작 확인

### 4.3 Phase 3 테스트 (UI/UX)

#### 상태 피드백 테스트
1. 자동이동 ON → "● 자동이동" + 마지막 동기화 시간 tooltip
2. 서버 오프라인 상태 → "⚠ 자동이동" + 오류 메시지
3. 수동 이동 실패 → 에러 유형별 메시지 확인

#### 반응성 테스트
1. 모바일(< 768px), 태블릿(768-1024px), 데스크톱(> 1024px) 환경 확인
2. 버튼 크기, 위치, 터치 영역 확인

### 4.4 Phase 4 테스트 (성능)

#### 캐시 상태 요청 테스트
```javascript
// DevTools Network 탭에서 확인
// 변경 전: 100개 노트 → 100개 동시 요청
// 변경 후: 100개 노트 → 10개 배치 × 10회 순차 요청
```

#### 폴링 간격 테스트
```javascript
// 콘솔에서 폴링 간격 모니터링
// TTS 재생 중: 2-5초 간격
// TTS 정지 중: 10-15초 간격
```

#### StateLock 성능 테스트
```javascript
// 동시 acquire 테스트
const lock = window.ttsAutoMoveStateLock;
const t1 = performance.now();
await lock.acquire('test1');
lock.release();
const t2 = performance.now();
console.log(`Lock acquire/release: ${t2-t1}ms`);
// 기대: < 1ms (Promise 큐 기반)
```

---

## 5. 위험 요소 및 완화

| 위험 | 영향 | 완화 방법 |
|------|------|----------|
| 인라인 코드로 view.js 크기 증가 (~80줄 추가) | 초기 로딩 미미하게 증가 | 모듈 로드 성공 시 인라인 코드 불실행 (if guard) |
| CustomEvent 리스너 누적 | 메모리 누수 | MutationObserver cleanup에서 리스너 제거 |
| 적응형 폴링 간격 증가 시 반응 지연 | 사용자 체감 지연 | 최대 15초 제한, 수동 이동은 즉시 |
| Phase 간 의존성으로 병렬 작업 제한 | 개발 속도 | Phase 1만 blocking, 나머지는 부분 병렬 가능 |

---

## 6. 범위 외 (향후 고려)

- tts-config.js `new Function()` 보안 이슈 → JSON.parse 전환 (별도 SPEC)
- window.* 전역 네임스페이스 정리 → `window.ObsidianTTS` 통합 (대규모 리팩토링)
- ES Module 전환 → Obsidian 플러그인 구조 변경 필요 (근본 해결)
- 단위 테스트 프레임워크 도입 → Obsidian 환경 제약으로 별도 검토

---

## 7. 승인 기준

- [ ] Phase 1: 콘솔 오류 0건, 자동이동 6초 내 동작
- [ ] Phase 2: CustomEvent 즉시 반응, 로컬 모드 위치 반환
- [ ] Phase 3: 3가지 상태(정상/로딩/오류) 피드백 표시
- [ ] Phase 4: 캐시 요청 배치화, 폴링 간격 적응형
