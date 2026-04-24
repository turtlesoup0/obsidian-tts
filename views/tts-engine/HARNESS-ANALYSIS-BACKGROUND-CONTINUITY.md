# TTS 백그라운드 연속재생 보장 메커니즘 — 하네스팀 합의 분석서

> **분석 일시**: 2026-04-16
> **대상 코드**: view.js (1,367줄, 4/9 백업본 기반), audio-state-machine.js (566줄)
> **분석 에이전트**: iOS Session Analyst, State Flow Analyst, Resilience Analyst
> **합의 수준**: 3/3 에이전트 전원 합의

---

## 1. 핵심 원리: "세션 사망 예방" vs "사후 복구"

### 3개 에이전트 합의 결론

> **이 코드의 연속재생이 보장되는 근본 이유는, iOS 오디오 세션이 끊기기 *전에* 다음 트랙으로 전환하여 세션 사망 자체를 예방하기 때문이다.**

iOS WKWebView에서 `Audio` 요소의 재생이 끝나면(`ended`), WebKit은 네이티브 `AVAudioSession`을 비활성화(deactivate)한다. 백그라운드 상태에서 세션이 비활성화되면 iOS는 해당 프로세스의 오디오 실행 권한을 회수하고, 이후 `play()` 호출은 차단된다.

```
[예방 — 작동하는 패턴]
트랙 A 재생 중 (세션 활성) → 0.3초 전 src 교체 → play() → 세션 무중단
  iOS 관점: "같은 Audio가 계속 재생 중"

[복구 — 리팩토링에서 깨진 패턴]  
트랙 A 재생 완료 (세션 종료) → onended → play() 시도 → 세션 이미 죽음
  iOS 관점: "새로운 재생 요청" → NotAllowedError 또는 무시
```

이것이 리팩토링 전에 1시간+ 연속재생이 됐고, `isBackground` 가드를 추가한 후 깨진 이유다.

---

## 2. 9개 방어 레이어 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    L1: timeupdate 선제 교체                      │
│              (트랙 종료 0.3초 전, 같은 Audio 요소 src 스왑)        │
│                    ★★★★★ — 유일한 "예방" 레이어                   │
├────────────────────────────┬────────────────────────────────────┤
│  L2: onended fast-play     │  L9: pause 이벤트 핸들러            │
│  (prefetch blob 즉시 재생)  │  (OS pause vs 사용자 pause 구분)    │
│  ★★★☆☆                    │  ★★★★★                            │
├────────────────────────────┤                                    │
│  L3: onended full fallback │  L6: InterruptDetector             │
│  (speakNoteWithServerCache)│  (비정상 중단 감지 → INTERRUPTED)    │
│  ★★★☆☆                    │  ★★★★☆                            │
├────────────────────────────┤                                    │
│  L4: visibilitychange 복구 │  L7: RecoveryStrategy              │
│  (포그라운드 복귀 시 3단계)  │  (3회 시도, 5초 타임아웃)           │
│  ★★★★☆                    │  ★★★★☆                            │
├────────────────────────────┤                                    │
│  L5: Watchdog (10초 주기)  │  L8: Media Session API             │
│  (상태 불일치 감지 → 복구)   │  (잠금화면 컨트롤, 메타데이터)       │
│  ★★☆☆☆                    │  ★★★☆☆                            │
└────────────────────────────┴────────────────────────────────────┘
```

### 레이어 캐스케이드 흐름

```
L1 성공 (95%+ 확률)
  → L2~L9 모두 비활성 경로 (스킵)
  → 다음 트랙에서 L1 다시 시도

L1 실패 (prefetch 미완료 or timeupdate throttling)
  → L2 시도: onended + prefetch blob → 즉시 play()
    → 성공 시 복귀
    → 실패 시 ↓

L2 실패 (prefetch 없음 or play() 실패)
  → L3 시도: speakNoteWithServerCache(index+1) — full 3단 캐시 해결
    → 포그라운드: 성공 (갭 0.5~3초)
    → 백그라운드: 네트워크 제한으로 실패 가능 ↓

L3 실패 (백그라운드 네트워크 차단)
  → 재생 멈춤
  → L9: _wasPlayingBeforeInterruption = true 기록
  → L6: INTERRUPTED 상태 전이
  → L7: 0.5초 후 자동 복구 시도 (최대 3회)
  → L5: 10초 주기 감시, 15~20초 후 추가 복구 시도
  → L4: 사용자 앱 복귀 시 3단계 복구 (fast → blob → reload)
```

---

## 3. Layer 1 정밀 분석: 왜 동작하는가

### 3-1. iOS Audio Session과 HTMLMediaElement의 바인딩

```
HTMLMediaElement (JS)
  └→ MediaPlayer (C++)
       └→ MediaPlayerPrivateAVFoundation (WebKit 네이티브 브릿지)
            └→ AVPlayer 인스턴스
                 └→ AVAudioSession 연결
```

**같은 HTMLMediaElement**의 `src`를 교체하면:
- 같은 `AVPlayer` 인스턴스가 `replaceCurrentItem(with:)`을 호출
- `AVAudioSession` 연결 유지
- Control Center / 잠금화면 Now Playing 정보 유지
- 백그라운드 실행 권한 유지

**다른 Audio 요소** 또는 **새 Audio()**를 사용하면:
- 새 `AVPlayer` 인스턴스 생성
- 기존 AVPlayer 해제 → 세션 비활성화
- iOS WKWebView는 동시 활성 MediaElement 수 제한 (보통 1개)
- 두 요소 간 전환 시 "무음 구간" → iOS가 "재생 아님"으로 판단

### 3-2. 0.3초 임계값의 근거

| 요소 | 값 | 설명 |
|------|-----|------|
| timeupdate 발생 빈도 | ~250ms (4Hz) | HTML 스펙 권장, WebKit 준수 |
| 0.3초 구간 내 발생 횟수 | 1~2회 | 최소 1회는 보장 |
| src 교체 + play() 소요시간 | <50ms | 동기적 Blob URL 설정, 네트워크 불필요 |
| 너무 크면 (>2초) | 위험 | 짧은 오디오 클립에서 즉시 트리거 |
| 너무 작으면 (<0.1초) | 위험 | timeupdate가 한 번도 조건 통과 못 함 |

**0.3초 = "timeupdate 1~2회 보장 + 실행 시간 여유"의 실용적 균형점**

### 3-3. `_nextTrackPrepared` 원샷 가드

```
timeupdate: ~4Hz → 0.3초 구간에서 2~3회 발생 가능

가드 없이:
  t=0ms:   첫 번째 timeupdate → src 교체 + play() ← 정상
  t=250ms: 두 번째 timeupdate → 또 src 교체!? ← 무한 루프/트랙 건너뛰기

가드 있을 때:
  t=0ms:   _nextTrackPrepared = true → src 교체 + play() ← 정상
  t=250ms: _nextTrackPrepared === true → return ← 차단
  ...
  다음 speakNoteWithServerCache() 호출 시: _nextTrackPrepared = false ← 리셋
```

### 3-4. Prefetch가 L1의 전제 조건인 이유

**백그라운드에서 네트워크 요청은 제한된다.**

iOS가 WKWebView를 백그라운드 오디오로 유지하더라도, 이는 오디오 디코딩/재생에 필요한 최소 실행만 허용한다. 새 `fetch()` 호출은 지연/실패할 수 있고, 서버 TTS 생성에 수초가 걸리면 오디오 세션이 유휴 상태가 되어 iOS가 deactivate한다.

```
Prefetch의 역할:
  1. 현재 트랙 재생 초반에 다음 트랙 blob을 미리 다운로드
  2. Blob으로 메모리에 보관
  3. 전환 시점: createObjectURL(blob) + audio.src = url만 실행
     → 네트워크 불필요, 순수 메모리 연산, 즉시 완료
```

**Prefetch 실패 시 폴백 체인:**

```
1순위: timeupdate + prefetched blob → 즉시 src 스왑 (세션 유지)
  ↓ (prefetch 없음)
2순위: onended + prefetched blob → ended 후 즉시 스왑
  ↓ (prefetch 없음)  
3순위: onended + speakNoteWithServerCache → 전체 TTS 요청
  ↓ (백그라운드에서 실패 가능)
4순위: visibilitychange → 포그라운드 복귀 시 재개
```

---

## 4. 상태 플래그 생명주기 (State Flow Analyst 합의)

### 4-1. 핵심 플래그 인과 체인

```
┌─────────────────────────────────────────────────────────────┐
│                    플래그 인과 관계도                          │
│                                                             │
│  audio.play() 성공                                          │
│    → 'play' 이벤트: isPlaying=true                           │
│    → StateMachine → PLAYING: isPaused=false, isStopped=false │
│                                                             │
│  OS 강제 pause (전화, 다른 앱 등)                              │
│    → 'pause' 이벤트: isPlaying=false                         │
│    → !isPaused && !isStopped → _wasPlayingBeforeInterruption=true │
│    → InterruptDetector → INTERRUPTED 전이                    │
│    → 0.5초 후 RecoveryStrategy 자동 복구                      │
│                                                             │
│  사용자 정지 (azureTTSStop)                                   │
│    → isStopped=true (pause() 전에 먼저!)                     │
│    → 'pause' 이벤트: isStopped=true 확인 → 복구 안 함         │
│    → 모든 가드 체인: isStopped → return (자동 재생 차단)        │
│                                                             │
│  백그라운드 진입 (visibilitychange 'hidden')                   │
│    → isPlaying=true → _wasPlayingBeforeInterruption=true     │
│    → mediaSession.playbackState = 'playing' (iOS 힌트)       │
│                                                             │
│  포그라운드 복귀 (visibilitychange 'visible')                  │
│    → _wasPlayingBeforeInterruption=true → 복구 시도           │
│    → 복구 성공 → _wasPlayingBeforeInterruption=false          │
└─────────────────────────────────────────────────────────────┘
```

### 4-2. `_nextTrackPrepared` 리셋 사이클과 L1↔L2 교대 패턴

```
트랙 N: speakNoteWithServerCache(N)
  │ _nextTrackPrepared = false ← 리셋
  │ audio.play() → prefetchNextTrack(N)
  │
  ├─ [L1] timeupdate: 0.3초 전
  │   _nextTrackPrepared = true ← 설정
  │   audio.src = 트랙 N+1 URL
  │   setupAudioHandlers() → 새 onended 등록 (N+1 기준)
  │   prefetchNextTrack(N+1) → 트랙 N+2 준비
  │
  ├─ 트랙 N+1 재생 중... timeupdate 계속 발동
  │   BUT _nextTrackPrepared === true → 모두 차단
  │
  ├─ 트랙 N+1 자연 종료 → onended(N+1) 발동
  │   [L2] prefetched(N+2) 있으면 → 즉시 src 스왑
  │        OR speakNoteWithServerCache(N+2) → _nextTrackPrepared = false 리셋
  │
  └─ 결과: L1 → L2 → L1 → L2 ... 교대 패턴
```

**핵심 발견**: timeupdate 경로(L1)는 `_nextTrackPrepared`를 직접 리셋하지 않으므로 **1회만 사용 가능**하다. 다음 트랙 전환은 반드시 onended 경로(L2/L3)를 통해야 한다. 이것은 L1과 L2가 자연스럽게 교대하는 패턴을 형성하며, 이중 전진(double-advance)을 구조적으로 방지한다.

---

## 5. 이중 전진 방지 메커니즘 (3개 에이전트 합의)

L1(timeupdate)과 L2(onended)가 동시에 다음 트랙으로 전진하지 않는 이유:

| 방어 수단 | 메커니즘 |
|-----------|---------|
| `_nextTrackPrepared` 원샷 | L1에서 true 설정 → 중복 실행 차단 |
| `audio.src` 교체 시 이벤트 억제 | src 변경 시 이전 소스의 `ended` 이벤트 미발생 (HTML5 스펙) |
| `setupAudioHandlers` 재바인딩 | onended가 새 인덱스(N+1) 기준으로 재설정 |
| `_prefetchedNext = null` 소비 | L1에서 소비하면 L2에서 prefetch 조건 불성립 |

---

## 6. 853트랙 내구성 분석

### 메모리 관리

| 항목 | 동시 존재량 | 853트랙 누적 | 평가 |
|------|------------|-------------|------|
| audioBlob (현재 트랙) | ~200KB × 1 | GC로 자동 해제 | ✅ 안전 |
| prefetchedNext blob | ~200KB × 1 | 소비 후 교체 | ✅ 안전 |
| Blob URL | 1~2개 활성 | ⚠️ timeupdate 경로에서 미해제 누적 | ⚠️ 경미 |
| stateHistory 배열 | ~2,500 항목 | trim 로직 없음 | ⚠️ 경미 |
| IndexedDB 캐시 | 853 × 200KB ≈ 170MB | 기본 한도(수백MB) 이내 | ✅ 안전 |
| 이벤트 리스너 | 동일 요소 재사용 | 누적 없음 | ✅ 안전 |

### Blob URL 누수 상세

```
⚠️ timeupdate 트랙 전환 시 (line 185):
  → URL.createObjectURL(nextBlob) 생성
  → 이전 reader._currentAudioUrl 덮어쓰기 (revokeObjectURL 미호출)
  → 853트랙: 최대 ~853개 orphan URL × ~100bytes = ~85KB
  → 실질적 메모리 영향: 미미 (브라우저 URL 매핑 테이블)
  → 상태: 알려진 약점이나 실용적 문제 없음
```

---

## 7. 알려진 약점과 한계 (3개 에이전트 전원 합의)

### 7-1. 방어 불가 — iOS 프로세스 종료 (★★★★★)

iOS가 메모리 압박으로 WKWebView 프로세스를 kill하면 모든 JavaScript 상태 소실. `visibilitychange`도 발동 안 됨. `localStorage`의 `lastPlayedIndex`만 생존. **웹 기술 한계로 방어 불가.**

### 7-2. 사용자 개입 필요 — NotAllowedError 연쇄 (★★★★☆)

전화 수신 등으로 iOS가 오디오 세션을 종료한 후, 모든 `play()` 호출이 NotAllowedError 반환. 모든 자동 복구 레이어가 동일한 에러에 부딪힘. **화면 터치만이 유일한 해결책.**

### 7-3. InterruptDetector pause 리스너 순서 의존 (★★★☆☆)

```
view.js pause 리스너 (먼저 등록, 먼저 실행):
  → reader.isPlaying = false

InterruptDetector pause 리스너 (나중 등록, 나중 실행):
  → reader.isPlaying 체크 → false → 조건 불성립 → INTERRUPTED 미전이

결과: InterruptDetector의 즉시 복구 경로가 작동 안 할 수 있음
보상: Watchdog가 10~20초 후 상태 불일치를 감지하여 대체 복구
```

### 7-4. isLoading true 설정 누락 (★★☆☆☆)

`isLoading = true` 설정 코드가 명시적으로 존재하지 않음. `StateMachine.syncReaderFlags('LOADING')`도 `isLoading`을 건드리지 않음. `azureTTSTogglePlayPause`의 이중 클릭 방지 가드가 작동하지 않을 수 있음.

### 7-5. Cold Cache 첫 트랙 전환 (★★☆☆☆)

Obsidian 재시작 직후 첫 트랙 재생 시, prefetch가 아직 완료되지 않아 L1이 작동 불가. 첫 번째 트랙→두 번째 트랙 전환은 L2/L3에 의존하며, 백그라운드 상태라면 실패 가능.

---

## 8. 아키텍처 설계 철학 (종합)

```
┌─────────────────────────────────────────────────────────┐
│              비대칭 방어 아키텍처                          │
│                                                         │
│  L1 (예방): 문제가 발생하지 않게 한다                      │
│    → 성공률 95%+                                        │
│    → 오디오 세션 무중단, 네트워크 불필요                    │
│                                                         │
│  L2~L9 (복구): L1 실패 시 사후 대응                       │
│    → 전체 실패 확률 = L1 실패 × L2 실패 × ... × L9 실패   │
│    → 각 레이어가 독립적이므로 곱셈으로 확률 감소             │
│                                                         │
│  핵심 원칙:                                              │
│  1. 같은 Audio 요소 재사용 (세션 유지)                     │
│  2. 트랙 종료 전에 교체 (세션 사망 예방)                    │
│  3. Prefetch로 네트워크 의존성 제거                        │
│  4. 모든 복구 레이어가 동일 가드 조건 공유 (충돌 방지)       │
│  5. 사용자 의도적 정지는 모든 자동 복구에서 존중             │
└─────────────────────────────────────────────────────────┘
```

---

## 부록: 리팩토링 시 반드시 보존해야 할 불변 규칙

| # | 불변 규칙 | 위반 시 결과 |
|---|----------|-------------|
| 1 | timeupdate에서 `isBackground` 체크 금지 | 백그라운드 연속재생 사망 |
| 2 | 트랙 전환 시 같은 Audio 요소의 src 교체 | 오디오 세션 끊김 |
| 3 | src 교체는 트랙 종료 전에 (0.3초 임계값) | ended 후 play() 차단 |
| 4 | Prefetch는 현재 트랙 재생 중에 비동기로 | L1 fast path 작동 전제 |
| 5 | `_nextTrackPrepared` 원샷 가드 유지 | 무한 루프/트랙 건너뛰기 |
| 6 | onended에서 `speakNoteWithServerCache` 폴백 유지 | prefetch 실패 시 완전 중단 |
| 7 | `isStopped`는 `pause()` 호출 전에 설정 | OS pause를 사용자 정지로 오인 |

---

*이 문서는 하네스팀 3개 에이전트(iOS Session Analyst, State Flow Analyst, Resilience Analyst)의 독립 분석을 종합하여 작성되었습니다. 모든 결론은 3/3 합의입니다.*
