# 수정 계획: StateLock Deadlock 해결

**문서 ID**: FIX-STATELOCK-DEADLOCK-001
**관련 버그 분석**: `bug-analysis-statelock-deadlock.md`
**작성일**: 2026-02-05
**상태**: 구현 완료, 테스트 대기

---

## 1. 문제 요약

| 항목 | 내용 |
|------|------|
| 증상 | 자동이동 토글 OFF→ON 후 토글 멈춤, 🎙️ 버튼 "확인 중..." 영구 정지 |
| 근본 원인 | StateLock 이중 acquire로 인한 Deadlock |
| 발생 위치 | `views/integrated-ui/view.js` |
| 영향 범위 | 토글 핸들러, 수동이동 버튼, 자동이동 폴링 |

### Deadlock 발생 흐름

```
토글 클릭 → acquire('toggle') → gotoTTSPosition() → acquire('manual-click')
                   ↑                                           ↓
                   └─────────── 순환 대기 (release 불가) ←──────┘
```

---

## 2. 수정 방안 선택

| 방안 | 설명 | 변경 규모 | 채택 |
|------|------|----------|------|
| **A: skipLock 파라미터** | 호출 컨텍스트에 따라 lock 스킵 | 2줄 | ✅ 채택 |
| B: Reentrant Lock | 같은 owner 재진입 허용 | ~15줄 | ❌ |
| C: 토글에서 lock 제거 | 토글 핸들러 lock 제거 | 3줄 | ❌ |

**채택 이유 (방안 A)**:
- 최소 변경으로 문제 해결
- 의도가 코드에 명시적 (skipLock 파라미터)
- 기존 StateLock 구조 변경 불필요
- 🎙️ 독립 클릭 시 lock 보호 유지

---

## 3. 상세 수정 내용

### 3.1 파일: `views/integrated-ui/view.js`

#### 변경 1: gotoTTSPosition 함수 시그니처 (633줄)

**Before**:
```javascript
// R3: Manual click handler with StateLock priority (R3.2: manual-click > auto-polling)
const gotoTTSPosition = async () => {
```

**After**:
```javascript
// R3: Manual click handler with StateLock priority (R3.2: manual-click > auto-polling)
// skipLock: 토글 핸들러 내부에서 호출 시 true (이미 lock 보유 → 이중 acquire 방지)
const gotoTTSPosition = async (skipLock = false) => {
```

#### 변경 2: hasStateLock 조건 (644줄)

**Before**:
```javascript
// StateLock이 있으면 사용, 없으면 lock 없이 직접 실행
const hasStateLock = !!window.ttsAutoMoveStateLock;
```

**After**:
```javascript
// StateLock이 있고, skipLock이 아니면 lock 획득
const hasStateLock = !skipLock && !!window.ttsAutoMoveStateLock;
```

#### 변경 3: 토글 핸들러 내부 호출 (988줄)

**Before**:
```javascript
// 즉시 TTS 위치로 이동
await gotoTTSPosition();
```

**After**:
```javascript
// 즉시 TTS 위치로 이동 (skipLock=true: 이미 토글에서 lock 보유)
await gotoTTSPosition(true);
```

---

## 4. 변경 영향 분석

### 4.1 gotoTTSPosition 호출처

| 호출 위치 | 컨텍스트 | skipLock | 이유 |
|----------|---------|----------|------|
| 988줄 (토글 핸들러) | 이미 `acquire('toggle')` 상태 | `true` | 이중 acquire 방지 |
| 769줄 (🎙️ 버튼 onclick) | 독립 호출 | `false` (기본값) | lock 보호 필요 |

### 4.2 호환성

- **기존 동작 유지**: `gotoTTSPosition()` 호출 시 기본값 `skipLock=false` → 기존과 동일
- **신규 동작**: `gotoTTSPosition(true)` → lock 스킵

### 4.3 위험 요소

| 위험 | 가능성 | 완화 |
|------|--------|------|
| 토글 내부에서 race condition | 낮음 | 토글 자체가 lock 보유 중이므로 보호됨 |
| skipLock 오용 | 낮음 | 호출처가 2곳뿐, 주석으로 의도 명시 |

---

## 5. 수정 후 동작 흐름

### 5.1 토글 OFF → ON 시 (수정 후)

```
토글 클릭
  │
  ▼
[978줄] acquire('toggle')     ← 🔒 Lock 획득
  │
  ▼
[988줄] gotoTTSPosition(true) ← skipLock=true
  │
  ▼
[644줄] hasStateLock = false  ← !skipLock && !! = false
  │     (acquire 스킵)
  │
  ▼
[652줄] getTTSPosition()      ← 정상 실행
  │
  ▼
[684줄] scrollToRow()         ← 정상 실행
  │
  ▼
[1007줄] release()            ← 🔓 Lock 해제
  │
  ▼
✅ 정상 완료
```

### 5.2 🎙️ 버튼 직접 클릭 시 (기존과 동일)

```
🎙️ 버튼 클릭
  │
  ▼
[769줄] gotoTTSPosition()     ← skipLock=false (기본값)
  │
  ▼
[644줄] hasStateLock = true   ← lock 사용
  │
  ▼
[648줄] acquire('manual-click') ← 🔒 Lock 획득
  │
  ▼
[652줄] getTTSPosition()
  │
  ▼
[711줄] release()             ← 🔓 Lock 해제
  │
  ▼
✅ 정상 완료
```

---

## 6. 테스트 계획

### 6.1 구문 검증

```bash
node --check views/integrated-ui/view.js
# 기대 결과: ✅ Syntax OK
```

### 6.2 기능 테스트

| # | 시나리오 | 수행 방법 | 기대 결과 | 통과 |
|---|---------|----------|----------|------|
| T1 | 토글 OFF→ON | 토글 클릭 | TTS 위치로 이동, 토글 정상 | ⬜ |
| T2 | 토글 연속 전환 | ON→OFF→ON→OFF (4회) | 모든 전환 정상 | ⬜ |
| T3 | 🎙️ 버튼 클릭 | 버튼 클릭 | "확인 중..." → 노트제목 → 복귀 | ⬜ |
| T4 | 토글 ON 직후 🎙️ | 토글 ON 후 즉시 버튼 클릭 | 두 동작 모두 정상 | ⬜ |
| T5 | 자동이동 중 수동이동 | 자동 폴링 중 🎙️ 클릭 | 수동이동 우선 실행 | ⬜ |

### 6.3 콘솔 로그 확인

토글 ON 시 기대 로그:
```
🎬 [TTS Auto-Move] 자동 모니터링 시작
▶️ [AutoMove] Started for note:table-0, interval=6000ms
🎙️ TTS 위치: 인덱스 매칭 "노트제목" → index N
✅ [StateLock] Manual click operation completed successfully
```

Deadlock 발생 시 (수정 전):
```
(로그 없음 - gotoTTSPosition 내부 acquire에서 영구 대기)
```

---

## 7. 롤백 계획

문제 발생 시 아래 명령으로 롤백:

```bash
git checkout HEAD~1 -- views/integrated-ui/view.js
```

또는 수동으로 3줄 원복:
1. 633줄: `(skipLock = false)` → `()`
2. 644줄: `!skipLock &&` 제거
3. 988줄: `(true)` → `()`

---

## 8. 커밋 메시지

```
fix: StateLock deadlock 수정 - 토글 내부 gotoTTSPosition에 skipLock 추가

- gotoTTSPosition(skipLock) 파라미터 추가
- 토글 핸들러에서 gotoTTSPosition(true) 호출 (이중 acquire 방지)
- 🎙️ 버튼 독립 클릭 시 기존 lock 동작 유지

Fixes: 토글 OFF→ON 후 토글/수동이동 버튼 멈춤 현상

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## 9. 구현 상태

- [x] 수정 코드 작성
- [x] 구문 검증 통과
- [ ] 기능 테스트 (사용자 수행)
- [ ] 커밋
