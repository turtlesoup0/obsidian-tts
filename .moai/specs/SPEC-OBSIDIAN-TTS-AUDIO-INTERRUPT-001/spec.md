# SPEC-OBSIDIAN-TTS-AUDIO-INTERRUPT-001

## TAG BLOCK

```yaml
SPEC_ID: SPEC-OBSIDIAN-TTS-AUDIO-INTERRUPT-001
Title: Obsidian TTS 오디오 인터럽트 처리 개선
Created: 2026-02-05
Status: Planned
Priority: High
Assigned: manager-ddd
Related_SPECs:
Epic: TTS 시스템 안정성 개선
Labels: tts, audio, interrupt-recovery, state-machine
```

## 환경 (Environment)

### 시스템 환경

- **플랫폼**: Obsidian Plugin (Desktop + Mobile)
- **오디오 API**: HTML5 Audio Element + Media Session API
- **대상 OS**: macOS, iOS, Windows, Android
- **브라우저**: Electron (Obsidian Desktop), Mobile WebKit

### 현재 문제 상황

1. **외부 오디오 인터럽트 감지 부족**
   - 다른 앱/시스템 소리 재생 시 TTS가 중단됨
   - 인터럽트 후 "재생중입니다..." 메시지만 표시되고 실제 재생 안 됨
   - Obsidian 재기동 필요

2. **상태 복구 메커니즘 부족**
   - visibilitychange 기반 복구는 화면 전환 시에만 작동
   - 백그라운드 인터럽트(다른 앱 소리) 감지 불가
   - 타임아웃 없는 무제한 대기

3. **에러 전파 누락**
   - play() Promise rejection이 처리되지 않음
   - 네트워크 오류 vs 일시적 인터럽트 구분 없음

### 기술 제약 사항

- HTML5 Audio API만 사용 (Web Audio API 미사용)
- Media Session API 지원 범위 제약 (모바일 일부)
- Obsidian Electron sandbox 환경 제약

## 가정 (Assumptions)

### 기술적 가정

1. **오디오 인터럽트 원인**
   - 시스템 오디오 포커스 변화 (다른 앱 소리, 알림 등)
   - 헤드폰 연결/해제로 인한 오디오 경로 변경
   - 백그라운드 진입으로 인한 OS 정책

2. **Media Session API 가용성**
   - 최신 모바일 브라우저에서는 지원됨
   - 일부 데스크톱 환경에서는 제한적 지원

3. **재개 가능성**
   - Blob URL이 유효한 경우 즉시 재개 가능
   - 오프라인 캐시가 있으면 복구 가능

### 사용자 가정

1. **사용자 기대**
   - 인터럽트 후 자동으로 재생 재개됨
   - 수동 재개가 필요한 경우 명확한 안내 표시
   - 재생 불가 상태에서는 정지 상태로 전환

2. **사용자 행동**
   - 인터럽트 후 화면을 다시 켜는 경우가 많음 (visibilitychange)
   - 재생 버튼 다시 누르는 시도가 있음

## 요구사항 (Requirements - EARS Format)

### R1: 오디오 인터럽트 감지 강화

**WHEN** 오디오 재생 중 외부 인터럽트가 발생 **THEN** 시스템은 즉시 인터럽트 유형을 감지하고 상태를 업데이트 **SHALL**

**R1.1**: **WHEN** Audio Element의 `pause` 이벤트가 발생하고 `isPaused`/`isStopped`가 false **THEN** 시스템은 이를 OS 강제 인터럽트로 간주하여 `_wasPlayingBeforeInterruption` 플래그를 설정 **SHALL**

**R1.2**: **WHEN** `ended` 이벤트 없이 `pause` 이벤트가 발생 **THEN** 시스템은 비정상 중단으로 기록 **SHALL**

**R1.3**: **WHERE** Media Session API가 지원되는 환경 **THEN** 시스템은 `interrupt` 이벤트 리스너를 추가하여 인터럽트 타입을 감지 **SHALL**

**R1.4**: **WHILE** 오디오가 재생 중 **WHEN** 헤드폰 연결/해제 이벤트(`audiooutputchange`)가 발생 **THEN** 시스템은 이를 인터럽트로 처리 **SHALL**

### R2: 상태 복구 메커니즘 개선

**WHEN** 인터럽트가 감지되고 복구 조건이 충족 **THEN** 시스템은 다단계 복구 전략을 수행 **SHALL**

**R2.1**: **WHEN** 화면이 다시 보이고(`visibilitychange` → `visible`) `_wasPlayingBeforeInterruption`이 true **THEN** 시스템은 500ms 지연 후 자동 복구를 시도 **SHALL**

**R2.2**: **WHEN** 자동 복구를 시도 **THEN** 시스템은 다음 순서대로 복구 방법을 시도 **SHALL**
   1. Fast path: `audio.readyState >= 2`면 `audio.play()` 직접 호출
   2. Recovery path: `_currentAudioBlob`에서 새 Blob URL 생성 후 재생
   3. Last resort: `speakNoteWithServerCache()`로 전체 재로드

**R2.3**: **IF** 모든 복구 시도가 실패 **THEN** 시스템은 사용자에게 명확한 에러 메시지를 표시하고 정지 상태로 전환 **SHALL**

**R2.4**: **WHILE** 복구 시도 중 **WHEN** 타임아웃(5초)이 경과 **THEN** 시스템은 복구를 중단하고 에러 상태로 전환 **SHALL**

### R3: 에러 처리 개선

**WHEN** 오디오 재생 중 에러가 발생 **THEN** 시스템은 에러 유형을 분류하고 적절히 처리 **SHALL**

**R3.1**: **WHEN** `play()` Promise가 rejected **THEN** 시스템은 에러 이름(`NotAllowedError`, `NotSupportedError` 등)을 기록 **SHALL**

**R3.2**: **IF** 에러가 `NotAllowedError`(자동 재생 정책 위반) **THEN** 시스템은 사용자 클릭을 유도하는 메시지를 표시 **SHALL**

**R3.3**: **IF** 에러가 `AbortError` 또는 네트워크 관련 **THEN** 시스템은 오프라인 캐시 복구를 시도 **SHALL**

**R3.4**: **WHEN** 에러 발생 **THEN** 시스템은 사용자에게 다음 정보를 포함한 메시지를 표시 **SHALL**
   - 에러 유형 (일시적 인터럽트 vs 영구적 오류)
   - 복구 가능 여부
   - 필요한 사용자 조치 (如果有)

### R4: 상태 머신 패턴 적용

**THE SYSTEM** 오디오 재생 상태를 명확하게 정의하는 상태 머신을 구현 **SHALL**

**R4.1**: **THE SYSTEM** 다음 상태를 정의 **SHALL**
   - `IDLE`: 초기 상태, 재생 준비 완료
   - `LOADING`: 오디오 로드 중
   - `PLAYING`: 재생 중
   - `PAUSED`: 사용자 일시정지
   - `INTERRUPTED`: 인터럽트 발생, 복구 대기 중
   - `ERROR`: 복구 불가능한 에러 상태
   - `STOPPED`: 정지 상태

**R4.2**: **WHEN** 상태 전이 발생 **THEN** 시스템은 상태 이벤트를 발생시키고 로그를 기록 **SHALL**

**R4.3**: **IF** 현재 상태가 `INTERRUPTED` **THEN** 시스템은 자동 복구를 시도 **SHALL**

**R4.4**: **WHILE** `INTERRUPTED` 상태 **WHEN** 복구 시도가 3회 실패 **THEN** 시스템은 `ERROR` 상태로 전이 **SHALL**

### R5: Watchdog 개선

**WHILE** 오디오가 재생 중 **WHEN** 내부 상태와 실제 상태 불일치가 감지 **THEN** Watchdog은 상태를 동기화 **SHALL**

**R5.1**: **WHEN** `isPlaying: true`지만 `audio.paused: true` 상태가 5초 지속 **THEN** Watchdog은 자동 복구를 시도 **SHALL**

**R5.2**: **IF** Watchdog 복구 시도가 실패 **THEN** 시스템은 `isPlaying`을 false로 설정하고 사용자에게 알림 **SHALL**

**R5.3**: **WHEN** Watchdog이 상태 불일치를 감지 **THEN** 시스템은 diagnostic 정보를 기록 **SHALL**
   - `audio.readyState`
   - `audio.paused`
   - `audio.src`
   - `audio.currentTime`

## 기술 사양 (Specifications)

### S1: 인터럽트 감지 레이어

```javascript
// 인터럽트 감지기 클래스
class AudioInterruptDetector {
    constructor(audioElement, stateMachine) {
        this.audioElement = audioElement;
        this.stateMachine = stateMachine;
        this.interruptionCount = 0;
        this.lastInterruptionTime = 0;
    }

    setupListeners() {
        // pause 이벤트: 비정상 중단 감지
        this.audioElement.addEventListener('pause', (e) => {
            if (!this.stateMachine.isUserPaused() && !this.stateMachine.isStopped()) {
                this.stateMachine.transitionTo('INTERRUPTED');
                this.interruptionCount++;
                this.lastInterruptionTime = Date.now();
            }
        });

        // Media Session API interrupt 이벤트
        if ('mediaSession' in navigator) {
            this.audioElement.addEventListener('interrupt', (e) => {
                this.handleMediaSessionInterrupt(e);
            });
        }

        // 헤드폰 연결/해제 감지
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                this.handleAudioOutputChange();
            });
        }
    }
}
```

### S2: 상태 머신 구조

```javascript
// 오디오 재생 상태 머신
class AudioPlaybackStateMachine {
    constructor() {
        this.state = 'IDLE';
        this.stateHistory = [];
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
    }

    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stateHistory.push({ from: oldState, to: newState, timestamp: Date.now() });

        // 상태별 로직 실행
        switch (newState) {
            case 'INTERRUPTED':
                this.onInterrupted();
                break;
            case 'ERROR':
                this.onError();
                break;
            case 'PLAYING':
                this.recoveryAttempts = 0; // 성공 시 복구 카운트 리셋
                break;
        }
    }

    onInterrupted() {
        // 자동 복구 시도
        if (this.recoveryAttempts < this.maxRecoveryAttempts) {
            setTimeout(() => this.attemptRecovery(), 500);
        } else {
            this.transitionTo('ERROR');
        }
    }
}
```

### S3: 복구 전략

```javascript
// 다단계 복구 전략
class AudioRecoveryStrategy {
    async attemptRecovery(audioElement, currentBlob, currentIndex) {
        // 1. Fast path: 직접 재생
        if (audioElement.readyState >= 2 && !audioElement.error) {
            try {
                await audioElement.play();
                return { success: true, method: 'fast' };
            } catch (e) {
                console.warn('[Recovery] Fast path failed:', e.message);
            }
        }

        // 2. Recovery path: Blob URL 재생성
        if (currentBlob) {
            try {
                const newUrl = URL.createObjectURL(currentBlob);
                audioElement.src = newUrl;
                await audioElement.play();
                return { success: true, method: 'blob-recovery' };
            } catch (e) {
                console.warn('[Recovery] Blob recovery failed:', e.message);
            }
        }

        // 3. Last resort: 캐시에서 재로드
        try {
            await window.speakNoteWithServerCache(currentIndex);
            return { success: true, method: 'full-reload' };
        } catch (e) {
            console.error('[Recovery] All recovery methods failed:', e);
            return { success: false, error: e.message };
        }
    }
}
```

### S4: 에러 처리 및 사용자 피드백

```javascript
// 에러 타입별 사용자 메시지
const ERROR_MESSAGES = {
    INTERRUPT_RECOVERABLE: '재생이 일시 중단되었습니다. 자동으로 다시 재생합니다...',
    INTERRUPT_NEEDS_USER: '재생이 중단되었습니다. 재생 버튼을 눌러주세요.',
    NETWORK_ERROR: '네트워크 오류가 발생했습니다. 오프라인 캐시에서 복구 시도 중...',
    PERMANENT_ERROR: '재생을 재개할 수 없습니다. Obsidian을 재기동해주세요.',
    AUTOPLAY_BLOCKED: '자동 재생이 차단되었습니다. 화면을 터치해주세요.'
};

function showUserFeedback(errorType, detail) {
    const lastPlayedDiv = document.getElementById('last-played-info');
    if (!lastPlayedDiv) return;

    lastPlayedDiv.innerHTML = `
        <div class="tts-error-feedback" style="padding: 12px; background: rgba(255,152,0,0.2); border-radius: 8px;">
            ${ERROR_MESSAGES[errorType] || detail}
            ${errorType === 'INTERRUPT_RECOVERABLE' ? '<div class="spinner"></div>' : ''}
        </div>
    `;
}
```

### S5: Watchdog 강화

```javascript
// 개선된 Watchdog
class AudioPlaybackWatchdog {
    constructor(audioElement, stateMachine) {
        this.audioElement = audioElement;
        this.stateMachine = stateMachine;
        this.checkInterval = 10000; // 10초
        this.mismatchGracePeriod = 5000; // 5초 유예
        this.mismatchDetectedAt = 0;
    }

    start() {
        this.timerId = setInterval(() => {
            this.checkStateConsistency();
        }, this.checkInterval);
    }

    checkStateConsistency() {
        const isStatePlaying = this.stateMachine.state === 'PLAYING';
        const isActuallyPaused = this.audioElement.paused;
        const hasSource = !!this.audioElement.src;
        const isReady = this.audioElement.readyState >= 2;

        if (isStatePlaying && isActuallyPaused && hasSource && isReady) {
            const now = Date.now();
            if (this.mismatchDetectedAt === 0) {
                this.mismatchDetectedAt = now;
                this.logDiagnostics();
            } else if (now - this.mismatchDetectedAt > this.mismatchGracePeriod) {
                this.at_watchdogRecovery();
            }
        } else {
            this.mismatchDetectedAt = 0;
        }
    }

    logDiagnostics() {
        console.warn('[Watchdog] State mismatch detected:', {
            stateMachine: this.stateMachine.state,
            audioPaused: this.audioElement.paused,
            readyState: this.audioElement.readyState,
            src: this.audioElement.src,
            currentTime: this.audioElement.currentTime,
            error: this.audioElement.error?.code
        });
    }
}
```

## 추적성 (Traceability)

### 요구사항-기능 매핑

| 요구사항 | 관련 파일 | 구현 포인트 |
|---------|----------|-----------|
| R1 (인터럽트 감지) | view.js | pause 이벤트 리스너, Media Session API |
| R2 (상태 복구) | view.js | visibilitychange 핸들러, 복구 전략 |
| R3 (에러 처리) | view.js | onerror 핸들러, play() Promise catch |
| R4 (상태 머신) | view.js | 새로운 StateMachine 클래스 |
| R5 (Watchdog) | view.js | setInterval 기반 상태 체크 |

### 통합 포인트

- **AudioManager** (`audio-manager.js`): 오디오 요소 래핑, 기본 이벤트 처리
- **view.js**: 주요 비즈니스 로직, 상태 관리, 복구 전략
- **Media Session API**: 시스템 수준 재생 컨트롤 연동

## 수용성 기준 (Acceptance Criteria Summary)

1. 인터럽트 발생 시 3초 내에 자동 감지
2. 복구 가능한 인터럽트는 5초 내에 재개
3. 복구 불가 시 명확한 에러 메시지 표시
4. 상태 불일치 발생 시 Watchdog이 10초 내에 감지
5. 사용자 수동 개입 없이 90% 이상의 인터럽트 자동 복구
