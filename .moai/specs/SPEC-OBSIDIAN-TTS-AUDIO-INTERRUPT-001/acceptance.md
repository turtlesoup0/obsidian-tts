# SPEC-OBSIDIAN-TTS-AUDIO-INTERRUPT-001: 수용성 기준

## 기능적 수용성 기준

### AC1: 인터럽트 감지

**GIVEN** TTS가 재생 중인 상태
**WHEN** 다른 앱에서 오디오를 재생하여 TTS가 중단됨
**THEN** 시스템은 3초 내에 인터럽트를 감지하고 `INTERRUPTED` 상태로 전이해야 함

```gherkin
Scenario: 다른 앱 오디오로 인한 인터럽트 감지
  Given TTS가 "[1/10] 노트1.md"을 재생 중
  When 사용자가 음악 앱에서 음악을 재생함
  Then Audio Element pause 이벤트가 발생함
  And isPaused는 false로 유지됨
  And isStopped는 false로 유지됨
  And stateMachine.state가 "INTERRUPTED"로 전이됨
  And _wasPlayingBeforeInterruption이 true로 설정됨
```

### AC2: 다단계 복구 전략

**GIVEN** 인터럽트가 발생한 상태
**WHEN** 복구 조건이 충족됨
**THEN** 시스템은 Fast path → Blob recovery → Full reload 순서로 복구를 시도해야 함

```gherkin
Scenario: Fast path 복구 성공
  Given stateMachine.state가 "INTERRUPTED"임
  And audio.readyState가 4 (HAVE_ENOUGH_DATA)임
  And audio.src에 유효한 URL이 있음
  When recoveryStrategy.attemptRecovery()가 호출됨
  Then Fast path: audio.play()가 직접 호출됨
  And audio.play() Promise가 resolve됨
  And stateMachine.state가 "PLAYING"으로 전이됨
  And recoveryAttempts가 0으로 리셋됨
```

```gherkin
Scenario: Blob recovery 복구 성공
  Given stateMachine.state가 "INTERRUPTED"임
  And audio.readyState가 0 (HAVE_NOTHING)임
  And _currentAudioBlob에 유효한 Blob이 있음
  When recoveryStrategy.attemptRecovery()가 호출됨
  Then Fast path가 실패로 감지됨
  And 새로운 Blob URL이 생성됨
  And audio.src가 새 URL로 설정됨
  And audio.play()가 호출됨
  And stateMachine.state가 "PLAYING"으로 전이됨
```

```gherkin
Scenario: Full reload 복구 성공
  Given stateMachine.state가 "INTERRUPTED"임
  And audio.readyState가 0임
  And _currentAudioBlob가 null임
  And 오프라인 캐시에 해당 노트의 오디오가 있음
  When recoveryStrategy.attemptRecovery()가 호출됨
  Then Fast path와 Blob recovery가 실패함
  And speakNoteWithServerCache(currentIndex)가 호출됨
  And stateMachine.state가 "PLAYING"으로 전이됨
```

### AC3: 복구 타임아웃

**GIVEN** 복구 시도가 진행 중인 상태
**WHEN** 5초 동안 복구가 완료되지 않음
**THEN** 시스템은 복구를 중단하고 다음 복구 단계로 넘어가거나 에러 상태로 전이해야 함

```gherkin
Scenario: 복구 타임아웃 발생
  Given stateMachine.state가 "INTERRUPTED"임
  And recoveryStrategy.attemptRecovery()가 호출됨
  And audio.play() Promise가 5초 동안 pending 상태임
  When 5초 타임아웃이 경과함
  Then 현재 복구 시도가 취소됨
  And 다음 복구 단계로 넘어감 (또는 ERROR 전이)
```

### AC4: 에러 처리 및 사용자 피드백

**GIVEN** 복구 시도가 모두 실패한 상태
**WHEN** 최대 복구 횟수(3회)에 도달함
**THEN** 시스템은 ERROR 상태로 전이하고 사용자에게 명확한 에러 메시지를 표시해야 함

```gherkin
Scenario: 복구 실패 시 에러 상태 전이
  Given stateMachine.state가 "INTERRUPTED"임
  And recoveryAttempts가 2임
  When recoveryStrategy.attemptRecovery()가 3번째로 실패함
  Then recoveryAttempts가 3이 됨
  And stateMachine.state가 "ERROR"로 전이됨
  And 사용자에게 에러 메시지가 표시됨
  And 에러 메시지에 "재생을 재개할 수 없습니다" 포함됨
```

```gherkin
Scenario: NotAllowedError (자동 재생 차단) 처리
  Given audio.play()가 NotAllowedError로 reject됨
  When 에러가 catch됨
  Then 에러 타입이 "NotAllowedError"로 식별됨
  And 사용자에게 "자동 재생이 차단되었습니다. 화면을 터치해주세요." 메시지 표시됨
```

### AC5: Watchdog 상태 동기화

**GIVEN** 상태 불일치가 발생한 상태
**WHEN** Watchdog이 불일치를 감지하고 5초 유예 기간이 경과함
**THEN** Watchdog은 자동 복구를 시도하거나 상태를 동기화해야 함

```gherkin
Scenario: Watchdog 상태 불일치 감지 및 복구
  Given stateMachine.state가 "PLAYING"임
  But audio.paused가 true임
  And audio.src에 유효한 URL이 있음
  And audio.readyState가 4임
  When Watchdog이 10초 간격 체크를 실행함
  Then 최초 감지: mismatchDetectedAt에 타임스탬프 기록됨
  And 5초 유예 기간 시작됨
  When 5초 유예 기간 경과 후 다시 체크함
  Then 상태 불일치가 지속 중으로 확인됨
  And Watchdog 복구 시도가 실행됨
```

## 비기능적 수용성 기준

### NFR1: 성능

- [ ] 인터럽트 감지 시간: 3초 이내
- [ ] 복구 시도 시간: 5초 이내 (각 단계)
- [ ] 상태 전이 오버헤드: 100ms 이내
- [ ] Watchdog CPU 영향: 1% 이하

### NFR2: 신뢰성

- [ ] 복구 가능한 인터럽트 자동 복구률: 90% 이상
- [ ] 무한 루프 발생: 0건
- [ ] 메모리 누수: 없음
- [ ] 상태 불일치: Watchdog이 10초 내에 감지

### NFR3: 호환성

- [ ] macOS (Electron): 동작
- [ ] iOS (Mobile Safari): 동작
- [ ] Windows (Electron): 동작
- [ ] Android (Chrome): 동작
- [ ] Media Session API 미지원 환경: 폴백 동작

### NFR4: 사용자 경험

- [ ] 복구 중 명확한 피드백 제공
- [ ] 복구 실패 시 명확한 에러 메시지
- [ ] 사용자 수동 개입 항상 가능
- [ ] 복구 중 다른 기능(일시정지, 정지 등) 정상 동작

## 테스트 시나리오 상세

### TS1: 정상 시나리오 - 다른 앱 오디오 인터럽트

**사전 조건**:
- Obsidian TTS 뷰가 열려 있음
- 노트 리스트가 로드됨
- 1번 노트가 재생 중

**단계**:
1. 사용자가 음악 앱으로 전환하여 음악 재생
2. TTS 오디오가 중단됨
3. Audio Element pause 이벤트 발생
4. InterruptDetector가 인터럽트 감지
5. StateMachine이 INTERRUPTED로 전이
6. 사용자가 Obsidian으로 복귀 (visibilitychange)
7. 복구 전략 실행 (Fast path → Blob recovery)
8. 오디오 재생 재개

**예상 결과**:
- 자동으로 TTS 재생 재개
- 사용자 개입 없음
- 상태가 PLAYING으로 복귀

### TS2: 헤드폰 연결/해제 인터럽트

**사전 조건**:
- TTS 재생 중
- 헤드폰이 연결됨

**단계**:
1. 사용자가 헤드폰 제거
2. 오디오 출력 장치 변경으로 인한 중단
3. devicechange 이벤트 발생
4. InterruptDetector 감지
5. 복구 시도

**예상 결과**:
- 인터럽트 감지
- 복구 시도 (성공 또는 실패에 따른 피드백)

### TS3: 복구 불가 시나리오 - 네트워크 오류

**사전 조건**:
- TTS 재생 중
- 오프라인 캐시 없음

**단계**:
1. 네트워크 연결 끊김
2. 오디오 로드 실패
3. 복구 시도 (Fast path, Blob recovery 실패)
4. Full reload 시도 실패
5. 3회 재시도 후 실패

**예상 결과**:
- ERROR 상태 전이
- 사용자에게 "네트워크 오류가 발생했습니다. 연결을 확인해주세요." 메시지
- 재생 버튼 클릭 시 다시 시도 가능

### TS4: Watchdog 복구

**사전 조건**:
- TTS 재생 중 (isPlaying: true)
- 실제 오디오는 paused 상태

**단계**:
1. Watchdog이 10초 간격 체크 실행
2. 상태 불일치 감지 (isPlaying: true, audio.paused: true)
3. 5초 유예 기간 시작
4. 유예 기간 경과 후에도 불일치 지속
5. Watchdog 복구 시도

**예상 결과**:
- diagnostic 정보 로그 기록
- 복구 시도 실행
- 성공 시 PLAYING 복귀, 실패 시 isPlaying false 설정

## Definition of Done

- [ ] 모든 EARS 요구사항 (R1-R5) 구현 완료
- [ ] 모든 수용성 기준 (AC1-AC5) 충족
- [ ] 단위 테스트 통과 (80% 이상 커버리지)
- [ ] 통합 테스트 시나리오 (TS1-TS4) 통과
- [ ] 비기능적 기준 (NFR1-NFR4) 충족
- [ ] 코드 리뷰 완료
- [ ] 문화권별 테스트 (한국어 메시지) 완료
- [ ] 사용자 매뉴얼 업데이트
- [ ] CHANGELOG 기록

## 롤백 계획

구현 후 다음 문제가 발생할 경우 롤백 고려:

1. **복구 성공률 70% 미만**: 기존 코드보다 낮은 경우
2. **새로운 버그 신고 10건 이상**: 회귀 버그
3. **성능 저하**: CPU 사용량 5% 이상 증가
4. **호환성 문제**: 특정 플랫폼에서 작동 불가

롤백 절차:
1. Git 이전 커밋으로 복귀
2. 문제 원인 분석
3. 수정 후 재배포
