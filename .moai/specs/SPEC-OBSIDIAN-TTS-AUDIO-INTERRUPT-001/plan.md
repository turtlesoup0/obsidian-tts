# SPEC-OBSIDIAN-TTS-AUDIO-INTERRUPT-001: 구현 계획

## 개요

본 SPEC은 Obsidian TTS 시스템의 오디오 인터럽트 처리를 개선하여 외부 오디오 소스, 시스템 인터럽트, 헤드폰 연결/해제 등 다양한 시나리오에서 자동으로 재생을 복구하는 기능을 구현합니다.

## 구현 마일스톤

### Priority High: 핵심 인터럽트 감지 및 복구

**목표**: 가장 흔한 인터럽트 시나리오에서 자동 복구 기능 구현

- [ ] R1.1: pause 이벤트 기반 인터럽트 감지 강화
  - `_wasPlayingBeforeInterruption` 플래그 로직 개선
  - `isPlaying` 플래그와의 동기화

- [ ] R2.1-R2.2: 다단계 복구 전략 구현
  - Fast path: 직접 play() 호출
  - Recovery path: Blob URL 재생성
  - Last resort: speakNoteWithServerCache() 재로드

- [ ] R2.4: 복구 타임아웃 설정
  - 각 복구 단계별 5초 타임아웃
  - 타임아웃 시 에러 상태 전이

### Priority Medium: 상태 머신 도입

**목표**: 명확한 상태 정의와 상태 전이 로직 구현

- [ ] R4.1: 상태 머신 클래스 구현
  - 상태 정의: IDLE, LOADING, PLAYING, PAUSED, INTERRUPTED, ERROR, STOPPED
  - transitionTo() 메서드 구현

- [ ] R4.2-R4.3: 상태 전이 로직
  - 각 상태 진입/이탈 시 로그 기록
  - INTERRUPTED 상태에서 자동 복구 트리거

- [ ] R4.4: 복구 실패 시 ERROR 상태 전이
  - 3회 복구 실패 시 에러 전이
  - 사용자에게 명확한 피드백

### Priority Medium: 에러 처리 개선

**목표**: Promise 기반 에러 처리와 사용자 피드백

- [ ] R3.1-R3.2: play() Promise rejection 처리
  - async/await 기반 에러 캐치
  - 에러 타입별 분류

- [ ] R3.3-R3.4: 네트워크 오류 복구
  - 오프라인 캐시 복구 시도
  - 사용자 피드백 메시지 구현

### Priority Low: 고급 감지 기능

**목표**: Media Session API, 헤드폰 감지 등 추가 기능

- [ ] R1.3: Media Session API interrupt 이벤트
  - `interrupt` 이벤트 리스너 추가
  - 인터럽트 타입 감지

- [ ] R1.4: 헤드폰 연결/해제 감지
  - `devicechange` 이벤트 리스너
  - 오디오 경로 변경 처리

- [ ] R5: Watchdog 강화
  - Diagnostic 정보 기록
  - 상태 불일치 자동 복구

## 기술적 접근 방식

### 1. 아키텍처 수정

**현재 문제**: 상태 관리가 분산되어 있음

**해결 방안**: 중앙 집중식 상태 머신 도입

```
현재: isPaused, isStopped, isPlaying, _wasPlayingBeforeInterruption 등 분산
개선: AudioPlaybackStateMachine 단일 클래스로 상태 중앙화
```

### 2. 클래스 구조

**새로운 클래스 추가**:

```javascript
// 상태 머신
class AudioPlaybackStateMachine {
    - state: string
    - transitionTo(newState)
    - getCurrentState()
    - isUserPaused()
    - isStopped()
    - onInterrupted()
    - onError()
}

// 인터럽트 감지기
class AudioInterruptDetector {
    - constructor(audioElement, stateMachine)
    - setupListeners()
    - handlePauseEvent()
    - handleMediaSessionInterrupt()
    - handleAudioOutputChange()
}

// 복구 전략
class AudioRecoveryStrategy {
    - async attemptRecovery(audioElement, currentBlob, currentIndex)
    - fastPath()
    - blobRecoveryPath()
    - fullReloadPath()
}

// 개선된 Watchdog
class AudioPlaybackWatchdog {
    - constructor(audioElement, stateMachine)
    - start()
    - checkStateConsistency()
    - logDiagnostics()
}
```

**기존 코드 수정**:

```javascript
// view.js 초기화 섹션 수정
const stateMachine = new AudioPlaybackStateMachine();
const interruptDetector = new AudioInterruptDetector(audioElement, stateMachine);
const recoveryStrategy = new AudioRecoveryStrategy();
const watchdog = new AudioPlaybackWatchdog(audioElement, stateMachine);

// 기존 window.azureTTSReader에 상태 머신 통합
window.azureTTSReader.stateMachine = stateMachine;
window.azureTTSReader.recoveryStrategy = recoveryStrategy;
```

### 3. 파일 변경 범위

**주요 변경 파일**:
- `views/tts-engine/view.js`: 상태 머신 통합, 인터럽트 감지 로직 수정
- `views/tts-engine/modules/audio-manager.js`: Watchdog 로직 개선

**최소 변경 원칙**: 기존 API(`azureTTSPlay`, `azureTTSPause` 등)는 호환성 유지

### 4. 이벤트 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                    인터럽트 감지 흐름                         │
└─────────────────────────────────────────────────────────────┘

1. 외부 오디오 재생 (다른 앱, 시스템 소리)
   ↓
2. Audio Element pause 이벤트 발생
   ↓
3. AudioInterruptDetector 감지
   - isUserPaused()? → 무시
   - isStopped()? → 무시
   - 그 외 → 인터럽트로 간주
   ↓
4. StateMachine.transitionTo('INTERRUPTED')
   ↓
5. StateMachine.onInterrupted()
   - recoveryAttempts < 3? → 복구 시도
   - recoveryAttempts >= 3? → ERROR 전이
   ↓
6. AudioRecoveryStrategy.attemptRecovery()
   - Fast path → 성공? → PLAYING 복귀
   - Blob recovery → 성공? → PLAYING 복귀
   - Full reload → 성공? → PLAYING 복귀
   - 모두 실패 → ERROR 상태
```

## 위험 요소 및 대응 계획

### 위험 1: Media Session API 제약

**위험**: 일부 환경에서 Media Session API가 지원되지 않음

**대응**:
- 기능 감지(feature detection) 후 조건부 사용
- 폴백으로 기존 pause/play 이벤트 리스너 사용

### 위험 2: 무한 복구 루프

**위험**: 복구 시도가 계속 실패하는 경우 무한 루프

**대응**:
- 최대 복구 횟수 제한 (3회)
- 복구 간 지연 (500ms)
- 타임아웃 설정 (각 복구 단계 5초)

### 위험 3: 사용자 혼란

**위험**: 자동 복구 중 사용자가 다른 작업을 시도할 경우 혼란

**대응**:
- 복구 중임을 명확히 표시
- 복구 실패 시 명확한 에러 메시지
- 사용자가 수동으로 재생 재개 가능하도록 버튼 활성화

### 위험 4: 성능 영향

**위험**: Watchdog과 상태 체크가 CPU 사용량 증가

**대응**:
- Watchdog 간격 10초로 유지
- 불필요한 로그는 production에서 비활성화
- diagnostic 기록은 오류 발생 시에만

## 테스트 전략

### 단위 테스트

1. **StateMachine 테스트**
   - 모든 상태 전이 경로 검증
   - 잘못된 전이 시도 차단 검증

2. **RecoveryStrategy 테스트**
   - 각 복구 경로 모킹 및 검증
   - 실패 시나리오 검증

3. **InterruptDetector 테스트**
   - 다양한 인터럽트 시나리오 모의

### 통합 테스트 시나리오

1. **다른 앱 오디오 재생 시나리오**
   - TTS 재생 중 → 다른 앱에서 음악 재생 → 다시 Obsidian으로 복귀
   - 기대: 자동으로 TTS 재개

2. **헤드폰 연결/해제 시나리오**
   - TTS 재생 중 → 헤드폰 제거 → 헤드폰 다시 연결
   - 기대: 자동으로 TTS 재개

3. **백그라운드 진입 시나리오**
   - TTS 재생 중 → 다른 앱으로 전환 → Obsidian으로 복귀
   - 기대: visibilitychange 이벤트로 자동 재개

4. **복구 불가 시나리오**
   - 오프라인 상태에서 캐시 없음 → 인터럽트 발생
   - 기대: ERROR 상태 전이, 명확한 에러 메시지

## 구현 순서

### Phase 1: 상태 머신 기반 (핵심)

1. `AudioPlaybackStateMachine` 클래스 구현
2. 기존 코드에 상태 머신 통합
3. 기본 상태 전이 로직 구현

### Phase 2: 인터럽트 감지 강화

1. `AudioInterruptDetector` 클래스 구현
2. pause 이벤트 리스너 개선
3. 복구 전략 구현

### Phase 3: 복구 메커니즘 완성

1. 다단계 복구 전략 구현
2. 타임아웃 및 재시도 로직
3. 사용자 피드백 메시지

### Phase 4: 고급 기능

1. Media Session API 통합
2. 헤드폰 감지
3. Watchdog 강화 및 diagnostic

## 성공 기준

1. **기능적 요구사항**: 모든 EARS 요구사항 충족
2. **복구 성공률**: 90% 이상의 인터럽트 자동 복구
3. **복구 시간**: 복구 가능한 인터럽트 5초 내 재개
4. **사용자 경험**: 복구 불가 시 명확한 피드백 제공
5. **안정성**: 무한 루프, 메모리 누수 없음
