# 기술회고: TTS 엔진 Phase 1 리팩토링 실패 분석

> **일시**: 2026-04-16  
> **대상**: view.js 리팩토링 (1,367줄 → 1,966줄, +599줄)  
> **결과**: 롤백 (4/9 백업본으로 복원)  
> **사용자 피드백**: "오늘 오전 이후로 연속재생이 이제는 거의 안된다" → 롤백 후 "확실히 연속재생 체감이 나아졌다"

---

## 시도된 변경 전체 목록 (17건)

### 카테고리 A: 핵심 아키텍처 변경 (3건) — 근본 원인

| # | 변경명 | 추가 코드량 | 의도 | 결과 |
|---|--------|------------|------|------|
| A1 | Dual Audio A/B Element | ~80줄 | 포그라운드에서 갭 없는 트랙 전환 (A 재생 중 B에 미리 로드 → 스왑) | ❌ **iOS 백그라운드에서 두 번째 Audio 요소의 play() 차단** |
| A2 | `isBackground` 가드 in timeupdate | ~100줄 | 포그라운드=Dual Audio, 백그라운드=같은 요소 분기 | ❌ **연속재생 사망의 직접 원인** — 조건 분기 자체가 백그라운드 경로를 onended로 밀어냄 |
| A3 | Silent Keepalive AudioContext | ~30줄 | 비가청 주파수(10Hz) 무한 재생으로 iOS 오디오 세션 유지 | ❌ **WKWebView에서 AudioContext와 HTMLMediaElement는 별도 세션** — 보조 효과 없음 |

#### A1: Dual Audio A/B Element

```javascript
// 추가된 코드
window.azureTTSReader.audioElementB = new Audio();
window._ttsGetActiveAudio = function() { ... };
window._ttsGetInactiveAudio = function() { ... };
window._ttsSwapAudio = function() { ... };
```

**왜 실패했는가**: iOS WKWebView는 **동시 활성 MediaElement 수를 1개로 제한**한다. 두 번째 Audio 요소에서 `play()`를 호출하면 첫 번째가 강제 정지되고, 전환 순간에 오디오 세션이 불안정해진다. 특히 백그라운드에서는 새 MediaElement에 대한 `play()`가 원천 차단된다.

**교훈**: 데스크톱 브라우저에서 동작하는 Dual Audio 패턴을 iOS WKWebView에 적용할 수 없다. 플랫폼 제약을 먼저 검증해야 한다.

---

#### A2: `isBackground` 가드 in timeupdate

```javascript
// 추가된 코드 (핵심 파괴 지점)
const isBackground = document.visibilityState === 'hidden';

if (!isBackground) {
    // 포그라운드: Dual Audio gapless 전환
    const inactiveAudio = window._ttsGetInactiveAudio();
    inactiveAudio.src = nextUrl;
    inactiveAudio.play().then(() => {
        window._ttsSwapAudio();
        audioEl.pause();
        // ...
    });
} else {
    // 백그라운드: 같은 엘리먼트 직접 전환 (원래 방식 복원?)
    audioEl.src = nextUrl;
    audioEl.play().then(() => { ... }).catch(e => { ... });
}
```

**왜 실패했는가**: 
1. 포그라운드 분기(Dual Audio)가 `inactiveAudio.play()` → `.then()` → `window._ttsSwapAudio()` → `audioEl.pause()`를 호출하는데, `.then()`은 **비동기**이므로 중간에 `pause` 이벤트가 먼저 발생하여 InterruptDetector가 INTERRUPTED 전이를 시도
2. 백그라운드 분기는 `audioEl.play().then()`으로 되어있으나, `.catch()` 안에서 상태를 롤백하면서 `reader._prefetchedNext`에 blob을 다시 넣는 복잡한 복구 로직이 추가됨 → 상태 꼬임
3. **가장 중요**: 이 `isBackground` 분기가 존재하는 것 자체가, 원래 단순했던 timeupdate 핸들러를 포그라운드/백그라운드 두 경로로 분열시켜 테스트 표면적을 2배로 늘림

**교훈**: 포그라운드와 백그라운드에서 **동일한 코드 경로**를 타야 한다. 분기를 만드는 순간 백그라운드 경로는 검증이 어려워진다.

---

#### A3: Silent Keepalive AudioContext

```javascript
window._ttsStartKeepalive = function() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 10;   // 비가청 주파수
    gain.gain.value = 0.001;    // 거의 무음
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    reader._keepaliveCtx = ctx;
};
```

**왜 실패했는가**: iOS에서 `AudioContext`와 `HTMLMediaElement`는 **별도의 오디오 렌더링 파이프라인**을 사용한다. AudioContext의 Web Audio API는 자체 렌더링 스레드를 가지며, HTMLMediaElement의 AVPlayer 기반 재생과 독립적이다. AudioContext가 재생 중이어도 HTMLMediaElement의 오디오 세션이 끝나면 iOS는 해당 세션을 비활성화한다.

**교훈**: "무음 재생으로 세션 유지"는 **같은 Audio 요소**에서 해야 의미가 있다. 별도 AudioContext는 다른 세션이다.

---

### 카테고리 B: 방어 코드 추가 (5건) — 부작용 발생

| # | 변경명 | 의도 | 결과 |
|---|--------|------|------|
| B1 | `_isTransitioning` 잠금 | 트랙 전환 중 InterruptDetector/Watchdog 오탐 방지 | ❌ **잠금 해제 타이밍 오류로 복구 경로 영구 차단** |
| B2 | `callId` 재진입 가드 | speakNoteWithServerCache 중복 호출 방지 | ⚠️ 의도는 맞으나, await 후 callId 비교가 정상 전환까지 차단 |
| B3 | Ghost playback 감지 | currentTime 전진 여부로 유령 재생 탐지 | ⚠️ 300ms 추가 딜레이가 복구 타이밍을 늦춤 |
| B4 | onended 인라인 전환 (백그라운드) | onended에서 speakNoteWithServerCache 대신 직접 전환 | ⚠️ 의도는 맞으나 catch 블록의 "세션 보호 위해 fallback 호출 안 함" 로직이 재생 완전 중단 |
| B5 | SRC_NOT_SUPPORTED 에러 핸들링 | error code 4 시 prefetch 폐기 후 재시도 | ✅ 단독으로는 문제 없음 |

#### B1: `_isTransitioning` 잠금 — 가장 위험했던 변경

```javascript
// audio-state-machine.js에 4곳 추가 (이후 롤백됨)
// view.js에서:
reader._isTransitioning = true;
// ... 전환 로직 ...
reader._isTransitioning = false;

// audioRecoveryRequested 이벤트 리스너에서:
if (reader?._isTransitioning) return;  // ← 복구 차단
```

**왜 실패했는가**: `_isTransitioning = true`를 설정한 후, `.catch()` 블록에서만 `false`로 리셋하고 `.then()` 성공 경로에서는 리셋을 깜빡했거나, play() Promise가 resolve되지 않는 엣지 케이스에서 영구적으로 `true`로 남아 모든 복구 경로가 차단됐다.

**교훈**: **잠금은 반드시 `try/finally` 패턴으로**. 비동기 코드에서 수동 잠금/해제는 거의 반드시 실패한다.

---

#### B4: onended 인라인 전환의 "세션 보호" catch

```javascript
} catch (bgError) {
    // speakNoteWithServerCache는 cleanupAudioElement로 양쪽 pause() → iOS 세션 사망
    // 대신 상태만 정리하고 포그라운드 복귀 시 복구에 맡김
    console.error('[onended-inline] 인라인 전환 실패 (세션 보호 위해 fallback 호출 안 함):', bgError.message);
    reader.isLoading = false;
    reader._isTransitioning = false;
    reader._wasPlayingBeforeInterruption = true;
}
```

**왜 실패했는가**: "세션을 보호하기 위해 fallback을 호출하지 않는다"는 논리가 **재생을 완전히 포기하는 결과**를 초래했다. 원래 코드의 `window.speakNoteWithServerCache(index + 1)` fallback이야말로 "어떻게든 다음 트랙을 재생하는" 최후의 보루였는데, 이를 의도적으로 제거한 것이다.

**교훈**: Fallback을 제거하는 것은 절대 안전한 선택이 아니다. "세션 보호"라는 이론적 이유로 실제 동작하는 복구 경로를 제거하면 안 된다.

---

### 카테고리 C: 코드 품질 개선 (9건) — 무해하나 불필요

| # | 변경명 | 의도 | 결과 |
|---|--------|------|------|
| C1 | `_ttsSetAudioUrl` (Blob URL 자동 해제) | 이전 URL revokeObjectURL 자동 호출 | ✅ 좋은 개선이나 복잡성 추가 |
| C2 | `_ttsEscapeHtml` (XSS 방지) | innerHTML에 동적 값 삽입 시 이스케이프 | ✅ 보안 개선이나 Obsidian 내부용이므로 실질 위협 없음 |
| C3 | 모듈 병렬 로딩 (`Promise.all`) | 로딩 속도 최적화 | ✅ 무해하나 체감 불가 (3개 파일 순차 vs 병렬 차이 미미) |
| C4 | 중복 리스너 방지 (`_ttsGuardListenersRegistered`) | addEventListener 중복 등록 방지 | ✅ 올바른 방어 코드 |
| C5 | DOM 엘리먼트 캐싱 (`_ttsLastPlayedDiv`, `_ttsToggleBtn`) | DOM 쿼리 반복 방지 | ⚠️ Dataview 리렌더링 시 캐시된 참조가 무효화될 수 있음 |
| C6 | `cleanupAudioElement` 헬퍼 | onended/onerror 해제 + pause 통합 | ✅ 코드 중복 제거 |
| C7 | `immediateUIUpdate` 헬퍼 | Next/Prev 버튼 즉시 반영 | ✅ UX 개선 |
| C8 | TTS 네임스페이스 등록 (`window.TTS.registerModule`) | 모듈 간 참조 표준화 | ✅ 구조 개선이나 현재 사용처 없음 |
| C9 | 종소리(Bell) 제거 | 백그라운드 연속재생 방해 요소 제거 | ⚠️ 의도는 맞으나 기능 삭제이므로 사용자 동의 필요 |

### 카테고리 D: 성능 최적화 시도 (1건) — 역효과

| # | 변경명 | 의도 | 결과 |
|---|--------|------|------|
| D1 | `prefetchAllTracks` (전체 플레이리스트 사전 캐싱) | 853트랙 전체를 IndexedDB에 미리 다운로드 | ❌ **현재 재생과 네트워크 경쟁, iOS 백그라운드 네트워크 제한에 부딪힘** |

#### D1: prefetchAllTracks — 86줄의 함정

```javascript
async function prefetchAllTracks(reader, cacheManager, startIndex) {
    for (let offset = 1; offset < total; offset++) {
        const idx = (startIndex + offset) % total;
        // ... IndexedDB 조회 → 서버 캐시 → TTS 생성 ...
    }
}
```

**왜 실패했는가**:
1. 853개 트랙을 순차적으로 다운로드하면서 현재 재생 트랙의 네트워크 요청과 경쟁
2. iOS 백그라운드에서는 네트워크 요청 자체가 throttle되어 현재 재생에 필요한 요청까지 지연
3. IndexedDB 쓰기가 대량으로 발생하여 I/O 부하 증가
4. TTS API 호출까지 포함되어 서버 할당량 소진 위험

**교훈**: "미리 다 다운로드" 전략은 **트랙 수가 적거나 Wi-Fi 충전 중**일 때만 적합하다. 재생 중 실행하면 현재 재생 품질을 저하시킨다. 하나씩 prefetch하는 기존 전략이 올바르다.

---

## 종합 분석: 실패의 구조적 원인

### 원인 1: 데스크톱 패턴의 iOS 이식

Dual Audio A/B 스왑은 Chrome 데스크톱에서 gapless 재생의 표준 패턴이다. 하지만 iOS WKWebView의 **단일 MediaElement 활성 제한**과 **백그라운드 play() 차단** 정책에 의해 작동 불가. 변경 전에 대상 플랫폼의 제약을 검증하지 않았다.

### 원인 2: 작동 원리를 이해하기 전에 개선 시도

기존 코드의 timeupdate 핸들러가 **왜** 백그라운드에서 작동하는지(같은 요소 + 끝나기 전 교체 = 세션 무중단) 이해하지 않은 상태에서, "더 나은 방식"으로 개선하려 했다. 결과적으로 작동하는 메커니즘을 파괴했다.

### 원인 3: 17개 변경을 한 번에 배포

17개 변경이 하나의 리팩토링에 포함되어, 어떤 변경이 문제를 일으켰는지 격리하기 불가능했다. 사용자 피드백("연속재생이 안 된다")을 받았을 때 개별 변경을 되돌리는 대신 전체 롤백만 가능했다.

### 원인 4: iOS 실기기 없이 변경 배포

Safari Web Inspector 원격 디버깅으로 검증 없이 코드를 변경했다. 백그라운드 연속재생은 **실제 iOS 잠금화면에서만 검증 가능한 동작**이므로, 데스크톱 시뮬레이션으로는 확인할 수 없다.

---

## 교훈 (Lessons Learned)

| # | 교훈 | 적용 규칙 |
|---|------|----------|
| 1 | **작동하는 코드의 원리를 먼저 이해하라** | 변경 전 하네스 분석을 먼저 실행 |
| 2 | **플랫폼 제약을 먼저 검증하라** | iOS WKWebView 제약은 MDN/WebKit 버그트래커에서 확인 |
| 3 | **한 번에 1개 변경, 실기기 검증** | 3-File Limit 규칙을 "1-Change-Per-Deploy"로 강화 |
| 4 | **분기를 만들지 마라** | 포그라운드/백그라운드 동일 코드 경로 유지 |
| 5 | **Fallback을 제거하지 마라** | 이론적 이유로 동작하는 복구 경로 삭제 금지 |
| 6 | **비동기 잠금은 try/finally** | `_isTransitioning` 같은 수동 잠금은 반드시 finally에서 해제 |
| 7 | **대량 작업은 재생과 분리** | prefetchAll 같은 I/O 집약 작업은 충전+Wi-Fi 시에만 |

---

## 타임라인

```
4/9  13:31  view.js.bak 생성 (1,367줄, 안정 버전)
           ↓ 리팩토링 시작 (Phase 1~3)
4/16 오전   17개 변경 적용된 view.js 배포 (1,966줄)
4/16 오전~  사용자: "연속재생이 거의 안된다"
4/16 낮     하네스팀 분석 → 5개 수정 추가 시도 (B1~B4 등)
4/16 낮     사용자: "개정내용이 체감되지않는다"
4/16 오후   근본 원인 발견: isBackground 가드 = 세션 사망
4/16 17:54  전체 롤백 → view.js.bak 복원 (1,367줄)
4/16 17:54  broken 버전 보존: view.js.broken-202604161754
4/16 이후   사용자: "확실히 연속재생 체감이 나아졌다"
```

---

## 재사용 가능한 변경 후보 (향후 개별 적용 검토)

롤백으로 폐기되었지만, **단독으로** 적용하면 문제없을 것으로 판단되는 변경:

| # | 변경 | 위험도 | 비고 |
|---|------|--------|------|
| C1 | Blob URL 자동 해제 (`_ttsSetAudioUrl`) | 낮음 | Blob URL 누수 해결 |
| C4 | 중복 리스너 방지 | 낮음 | Dataview 리렌더링 시 방어 |
| C6 | `cleanupAudioElement` 헬퍼 | 낮음 | 코드 중복 제거 |
| B5 | SRC_NOT_SUPPORTED 에러 핸들링 | 낮음 | 에러 복원력 향상 |

**적용 조건**: 1개씩, 실기기 검증 후, 문제 없으면 다음 변경.

---

*이 회고는 view.js.bak(1,367줄)과 view.js.broken-202604161754(1,966줄)의 전체 diff 분석에 기반합니다.*
