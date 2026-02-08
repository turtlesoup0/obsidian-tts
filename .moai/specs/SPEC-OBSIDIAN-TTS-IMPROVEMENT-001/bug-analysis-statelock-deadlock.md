# 버그 분석: StateLock Deadlock (자동이동 토글 + 수동이동 멈춤)

**보고일**: 2026-02-05
**심각도**: CRITICAL
**재현율**: 100%
**관련 파일**: `views/integrated-ui/view.js`

---

## 1. 증상

1. 통합노트에서 자동이동 토글을 OFF → ON 하면, 이후 토글이 완전히 멈춤
2. TTS 수동이동(🎙️) 버튼도 "확인 중..." 상태로 영구 정지
3. 이후 모든 StateLock 관련 기능이 동작하지 않음

---

## 2. 근본 원인: 비재진입 StateLock의 이중 acquire

### 실행 흐름 추적

```
사용자 클릭: 토글 ON
  │
  ▼
[972줄] ttsToggleSwitch.onclick
  │
  ▼
[978줄] await StateLock.acquire('toggle')     ← 🔒 Lock 획득 (owner: 'toggle')
  │     this.locked = true
  │     this.currentOwner = 'toggle'
  │
  ▼
[988줄] await gotoTTSPosition()               ← 함수 호출
  │
  ▼
[644줄] hasStateLock = true
[648줄] await StateLock.acquire('manual-click') ← 🔒🔒 이중 acquire 시도!
  │
  ▼
  │  acquire() 내부:
  │  - this.locked === true (이미 'toggle'이 잡고 있음)
  │  - this.currentOwner === 'toggle' (!== 'auto-polling')
  │  - 우선순위 바이패스 불가
  │  - waitQueue에 push → Promise가 영원히 resolve 안됨
  │
  ▼
  ╔═══════════════════════════════════════════╗
  ║              💀 DEADLOCK                  ║
  ║                                           ║
  ║  toggle handler: gotoTTSPosition 완료 대기 ║
  ║  gotoTTSPosition: lock release 대기        ║
  ║  lock release: toggle handler finally 대기  ║
  ║  → 순환 대기 (circular wait)               ║
  ╚═══════════════════════════════════════════╝
```

### 코드 레벨 증거

**토글 핸들러** (972-1009줄):
```javascript
// 978줄: Lock 획득
if (window.ttsAutoMoveStateLock) await window.ttsAutoMoveStateLock.acquire('toggle');
try {
    if (newState) {
        // ...
        await gotoTTSPosition();  // 988줄: ⚠️ 내부에서 다시 acquire 시도!
        // ...
    }
} finally {
    // 1007줄: 여기서 release 해야 하는데, try 블록이 끝나지 않음
    if (window.ttsAutoMoveStateLock) window.ttsAutoMoveStateLock.release();
}
```

**gotoTTSPosition** (633-714줄):
```javascript
const hasStateLock = !!window.ttsAutoMoveStateLock;  // 644줄: true
try {
    if (hasStateLock) {
        await window.ttsAutoMoveStateLock.acquire('manual-click');  // 648줄: 💀 영원히 대기
    }
    // 이 아래 코드는 절대 실행되지 않음
    // ...
} finally {
    if (window.ttsAutoMoveStateLock) {
        window.ttsAutoMoveStateLock.release();  // 711줄: 절대 도달 안됨
    }
}
```

**StateLock 구현** (49-78줄):
```javascript
acquire(owner) {
    if (!this.locked) {                    // 첫 번째 acquire: 통과
        this.locked = true;
        this.currentOwner = owner;
        return Promise.resolve();
    }
    // manual-click > auto-polling 우선순위
    if (this.currentOwner === 'auto-polling' && owner === 'manual-click') {
        this.locked = false;
        return this.acquire(owner);        // 재진입 허용 (auto-polling 한정)
    }
    // 🔥 'toggle' owner일 때 'manual-click'은 큐에 대기
    return new Promise(resolve => this.waitQueue.push(resolve));  // 영원히 대기
}
```

---

## 3. 왜 수동이동 버튼도 멈추나?

Deadlock 발생 후:
- `StateLock.locked === true` (영구)
- `StateLock.currentOwner === 'toggle'` (영구)
- `StateLock.waitQueue === [resolve_of_gotoTTSPosition]` (배출 불가)

이 상태에서 사용자가 🎙️ 버튼을 클릭하면:
1. `gotoTTSPosition()` 호출
2. `ttsBtn.textContent = '🎙️ ⏳'` (640줄) → "확인 중..." 표시
3. `await acquire('manual-click')` → waitQueue에 push → **영원히 대기**
4. fetch 호출, 결과 표시, 버튼 텍스트 복원 코드에 절대 도달하지 않음

---

## 4. Deadlock 4가지 필요조건 (Coffman 조건)

| 조건 | 해당 여부 | 설명 |
|------|----------|------|
| ①상호 배제 | ✅ | StateLock은 한 번에 하나만 acquire 가능 |
| ②점유 대기 | ✅ | toggle이 lock을 점유한 채 gotoTTSPosition 완료를 대기 |
| ③비선점 | ✅ | 'toggle' owner는 'manual-click'에 의해 선점되지 않음 |
| ④순환 대기 | ✅ | toggle → gotoTTSPosition → lock release → toggle finally |

4가지 조건이 모두 성립하므로 Deadlock 발생은 **필연적**.

---

## 5. 수정 방안

### 방안 A: gotoTTSPosition에서 lock 제거 (권장)

`gotoTTSPosition()`이 독립 호출과 토글 내부 호출 두 경우에 사용됨.
토글 핸들러에서 호출할 때는 이미 lock을 잡고 있으므로 이중 acquire 불필요.

```javascript
// gotoTTSPosition에 skipLock 파라미터 추가
const gotoTTSPosition = async (skipLock = false) => {
    // ...
    const hasStateLock = !skipLock && !!window.ttsAutoMoveStateLock;
    // ...
};

// 토글 핸들러에서 호출 시
await gotoTTSPosition(true);  // lock 스킵

// 🎙️ 버튼 직접 클릭 시
await gotoTTSPosition(false); // lock 사용
```

**장점**: 최소 변경, 명확한 의도
**변경 범위**: 2줄 수정 (함수 시그니처 + 호출부)

### 방안 B: StateLock을 재진입 가능(Reentrant)으로 변경

같은 owner가 이중 acquire하면 즉시 통과:

```javascript
acquire(owner) {
    if (!this.locked) {
        this.locked = true;
        this.currentOwner = owner;
        this.depth = 1;
        return Promise.resolve();
    }
    // 재진입 허용: 같은 owner면 depth만 증가
    if (this.currentOwner === owner) {
        this.depth++;
        return Promise.resolve();
    }
    // ...
}
release() {
    this.depth--;
    if (this.depth === 0) {
        // 실제 해제
    }
}
```

**장점**: 근본 해결
**단점**: StateLock 구조 변경 필요, owner 불일치 시 ('toggle' vs 'manual-click') 여전히 deadlock

### 방안 C: 토글 핸들러에서 lock 제거

토글 ON/OFF는 단순 상태 변경이므로 lock이 불필요할 수 있음:

```javascript
ttsToggleSwitch.onclick = async (event) => {
    // StateLock 없이 직접 실행
    // ...
    await gotoTTSPosition();  // gotoTTSPosition 내부에서만 lock 사용
};
```

**장점**: 간단
**단점**: 토글 중 race condition 가능 (실질적으로 무시 가능한 수준)

---

## 6. 권장 수정: 방안 A (skipLock)

**이유**:
- 최소 변경 (2줄)
- 의도가 명확 (호출 컨텍스트에 따른 lock 제어)
- 기존 StateLock 구조 변경 불필요
- 🎙️ 독립 클릭 시 lock 보호 유지

**수정 위치**:
1. `views/integrated-ui/view.js:633` — `gotoTTSPosition` 파라미터 추가
2. `views/integrated-ui/view.js:988` — `gotoTTSPosition(true)` 호출

---

## 7. 재현 방법

1. Obsidian에서 출제예상 통합노트 열기
2. 자동이동 토글이 ON 상태인지 확인
3. 토글 OFF 클릭
4. 토글 ON 클릭
5. **결과**: 토글이 멈추고, 🎙️ 버튼 클릭 시 "확인 중..." 영구 표시

---

## 8. 검증 방법

수정 후 아래 시나리오에서 deadlock이 발생하지 않아야 함:

| # | 시나리오 | 기대 결과 |
|---|---------|----------|
| 1 | 토글 OFF → ON | 토글 정상 동작, TTS 위치로 이동 |
| 2 | 토글 ON → OFF → ON → OFF (연속) | 모든 전환 정상 |
| 3 | 토글 ON 직후 🎙️ 클릭 | 두 동작 모두 정상 |
| 4 | 🎙️ 클릭 중 토글 OFF | 수동 이동 완료 후 토글 OFF |
| 5 | 자동 폴링 중 🎙️ 클릭 | 폴링 중단, 수동 이동 실행 |
