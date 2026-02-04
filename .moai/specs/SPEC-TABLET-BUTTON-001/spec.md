# SPEC-TABLET-BUTTON-001: 태블릿 버튼 표시 Race Condition 수정

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TABLET-BUTTON-001
Title: 태블릿 디바이스 버튼 표시 Race Condition 수정
Status: Planned
Priority: High
Assigned: manager-ddd
Created: 2025-02-04
Target: views/integrated-ui/view.js
Related: SPEC-TTS-AUTOMOVE-001
Lifecycle: spec-first
```

## Environment

### 실행 환경

- **Obsidian 플랫폼**:
  - Desktop: Electron 환경 (Chromium 기반)
  - Mobile: Capacitor 기반 (iOS/Android)
- **대상 디바이스**:
  - iPad (M1 프로세서) - 고성능
  - iPhone - 고성능
  - Android Tablet - 저사양
  - Desktop - 다양한 성능

### Obsidian 환경 특성

Obsidian은 일반적인 웹브라우저 환경과 다른 특수성이 있음:

1. **Electron 환경 (Desktop)**:
   - Node.js API 접근 가능
   - Chromium V8 엔진 사용
   - 파일 시스템 직접 접근
   - 다른 프로세스와의 IPC 통신

2. **Capacitor 환경 (Mobile)**:
   - 네이티브 기능 브릿지
   - 웹뷰 제약사항
   - 배터리 최적화 메커니즘
   - 메모리 제약

3. **Dataview 플러그인 렌더링 특성**:
   - 비동기 렌더링
   - MutationObserver 기반 DOM 감지
   - 디바이스 성능에 따른 렌더링 속도 차이

## Assumptions

### 기술 가정

| 가정 | 신뢰도 | 근거 | 위험 |
|-----|--------|------|------|
| Obsidian Dataview가 비동기로 렌더링됨 | 높음 | Dataview 플러그인 문서 확인 | 중간: 렌더링 방식 변경 시 영향 |
| MutationObserver가 모든 플랫폼에서 지원됨 | 높음 | 표준 Web API, Obsidian 최소 요구사항 충족 | 낮음: 폐기 계획 없음 |
| requestIdleCallback이 iOS에서 지원됨 | 중간 | Safari 지원, but 제약 있을 수 있음 | 중간: 폴백 필요 |
| 고성능 디바이스에서 DOM 렌더링이 빠름 | 높음 | M1 프로세서 성능 데이터 | 낮음: 성능 특성 안정적 |

### 비즈니스 가정

| 가정 | 신뢰도 | 근거 | 위험 |
|-----|--------|------|------|
| 사용자가 iPad/iPhone에서 저장/이동/TTS 버튼 필요 | 높음 | 사용자 요청 | 높음: 기능 미작동 시 사용성 저하 |
| Android 태블릿에서 정상 작동함 | 높음 | 사용자 보고 | 낮음: 이미 검증됨 |

### 루트 원인 분석 (Five Whys)

1. **Surface Problem**: iPad/iPhone에서 버튼이 표시되지 않음
2. **First Why**: `initUI()`가 호출되었지만 `rows.length === 0`으로 조기 리턴됨
3. **Second Why**: `waitForTable`의 `tbody tr` 체크가 `<tbody>`는 발견했지만 `<tr>` 요소는 아직 추가되지 않은 시점에 실행됨
4. **Third Why**: 고성능 디바이스에서 Dataview 렌더링이 매우 빨라 MutationObserver 첫 트리거에서 `disconnect()`가 호출됨
5. **Root Cause**: `tbody tr` 선택자가 `<tr>` 요소의 실제 존재를 확인하기 전에 `<tbody>` 요소만 존재해도 true를 반환할 수 있는 Race Condition

### 검증 방법

1. Dataview 렌더링 로그로 시점 확인
2. 다양한 디바이스에서 테스트 (iPad, iPhone, Android, Desktop)
3. Obsidian 버전별 호환성 확인

## Requirements (EARS Format)

### REQ-001: Ubiquitous (항상 활성)

**시스템은 항상 Dataview 테이블의 모든 행(`<tr>`)이 실제로 DOM에 추가될 때까지 기다려야 한다.**

**RATIONALE**: `<tbody>` 요소의 존재만으로는 불충분하며, 실제 데이터 행이 렌더링되었는지 확인해야 버튼이 올바른 위치에 생성됨.

**TEST STRATEGY**: 모든 테스트 시나리오에서 이 요구사항을 공통 검증 항목으로 포함.

---

### REQ-002: Event-Driven (WHEN-THEN)

**WHEN** Dataview 테이블의 첫 번째 `<tr>` 요소가 DOM에 추가됨, **THEN** 시스템은 버튼 UI 초기화(`initUI()`)를 실행해야 한다.

**RATIONALE**: 실제 행 추가 이벤트를 기다림으로써 Race Condition을 방지.

**TEST STRATEGY**: MutationObserver를 사용한 이벤트 기반 테스트.

---

### REQ-003: Event-Driven (WHEN-THEN)

**WHEN** Dataview 테이블에 이미 `<tr>` 요소가 존재하는 상태로 로드됨, **THEN** 시스템은 즉시 버튼 UI를 초기화해야 한다.

**RATIONALE**: 이미 렌더링된 테이블에 대해서는 지연 없이 UI를 표시해야 함.

**TEST STRATEGY**: Pre-rendered 테이블 상황 시뮬레이션.

---

### REQ-004: State-Driven (IF-THEN)

**IF** `requestIdleCallback`이 지원되는 환경(Chrome, Safari)일 경우, **THEN** 시스템은 `requestIdleCallback`을 사용하여 UI 초기화를 예약해야 한다. **ELSE** `setTimeout` 폴백을 사용해야 한다.

**RATIONALE**: 브라우저 호환성 유지하며 성능 최적화.

**TEST STRATEGY**: 다양한 브라우저 환경 시뮬레이션.

---

### REQ-005: Unwanted (금지 동작)

**시스템은 `<tbody>` 요소만 존재하고 `<tr>` 요소가 없는 상태에서 UI 초기화를 실행해서는 안 된다.**

**RATIONALE**: 현재 버그를 방지하기 위한 금지 조건.

**TEST STRATEGY**: 부정 테스트 케이스로 검증.

---

### REQ-006: Unwanted (금지 동작)

**시스템은 버튼 UI를 두 번 이상 중복 생성해서는 안 된다.**

**RATIONALE**: 기존 가드 클로저(`table.parentNode.querySelector('.in-search-container')`)를 유지하여 중복 생성 방지.

**TEST STRATEGY**: 중복 생성 시도 테스트.

---

### REQ-007: Optional (선택 사항)

**가능하면** 시스템은 디바이스 성능에 따라 적응형 타임아웃을 제공해야 한다.

**RATIONALE**: 저사양 디바이스에서는 더 긴 타임아웃을, 고성능 디바이스에서는 더 짧은 타임아웃을 사용하여 사용자 경험 최적화.

**TEST STRATEGY**: 성능 프로파일링 기반 테스트.

---

## Specifications

### SPEC-001: 안전한 행 감지 로직

```javascript
// 현재 (문제있는) 코드
if (table?.querySelector('tbody tr')) {
    waitForTable.disconnect();
    initUI();
}

// 수정된 코드
const tbody = table?.querySelector('tbody');
const rows = tbody?.querySelectorAll('tr') ?? [];
if (tbody && rows.length > 0) {
    waitForTable.disconnect();
    initUI();
}
```

**TECHNICAL APPROACH**:
1. `<tbody>` 요소와 `<tr>` 요소를 분리하여 확인
2. `querySelectorAll`을 사용하여 실제 행 개수 확인
3. `rows.length > 0`을 명시적으로 체크

---

### SPEC-002: MutationObserver 개선

```javascript
const waitForTable = new MutationObserver((mutations) => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 0) {
        waitForTable.disconnect();
        scheduleUIInit();
    }
});
```

**TECHNICAL APPROACH**:
1. 각 단계별 null 체크 추가
2. `rows.length > 0` 명시적 확인
3. `scheduleUIInit()` 함수로 초기화 로직 분리

---

### SPEC-003: 초기화 스케줄링 함수

```javascript
const scheduleUIInit = () => {
    const init = () => {
        const table = dvRef.container.querySelector('.table-view-table');
        if (!table) {
            // 테이블이 사라진 경우 재시도
            setTimeout(scheduleUIInit, 100);
            return;
        }

        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) {
            // 여전히 행이 없는 경우 재시도
            setTimeout(scheduleUIInit, 100);
            return;
        }

        initUI();
    };

    if (window.requestIdleCallback) {
        requestIdleCallback(() => init(), { timeout: 200 });
    } else {
        setTimeout(() => init(), 50);
    }
};
```

**TECHNICAL APPROACH**:
1. 재시도 메커니즘 추가
2. 안전한 행 개수 확인
3. 브라우저 호환성 유지

---

### SPEC-004: Obsidian 플랫폼별 테스트 환경

| 플랫폼 | 테스트 방법 | 고려사항 |
|--------|-----------|---------|
| Desktop (Electron) | Obsidian Desktop 앱 | Node.js API 사용 가능 |
| iOS (iPad/iPhone) | Obsidian iOS 앱 또는 Capacitor 빌드 | WebView 제약, requestIdleCallback 지원 |
| Android | Obsidian Android 앱 | WebView 제약, 다른 렌더링 타이밍 |
| Web Browser | Chrome DevTools 모바일 에뮬레이션 | 렌더링 속도 조절 가능 |

---

### SPEC-005: 크로스 플랫폼 렌더링 타이밍

```
저사양 디바이스 (Android Tablet):
Dataview 렌더링 시작 → ...200ms... → <tbody> 생성 → ...100ms... → 첫 번째 <tr> 추가
                                                      ↑
                                                    MutationObserver 트리거
                                                    rows.length > 0 ✓

고성능 디바이스 (iPad M1):
Dataview 렌더링 시작 → <tbody> 생성 → 첫 번째 <tr> 추가 (동일 프레임)
                                        ↑
                                      MutationObserver 트리거
                                      rows.length > 0 ✓
```

---

## Success Criteria

### 기능적 완료 기준

- [ ] 모든 테스트 시나리오 통과 (Given-When-Then)
- [ ] iPad/iPhone에서 버튼 정상 표시
- [ ] Android 태블릿에서 기존 동작 유지 (회귀 없음)
- [ ] Desktop에서 기존 동작 유지
- [ ] Dataview가 비어있는 경우 (행 없음) 안전한 무시

### 품질 기준

- [ ] 코드 커버리지 85% 이상
- [ ] LSP 오류 0개
- [ ] LSP 경고 10개 이하
- [ ] 모든 EARS 요구사항이 테스트로 검증됨
- [ ] TRUST 5 프레임워트 준수

### 성능 기준

- [ ] 버튼 표시까지의 지연 시간: 500ms 이하 (P95)
- [ ] MutationObserver 메모리 누수 없음
- [ ] 중복 초기화 방지 확인

## Traceability

| REQ | SPEC | Test Scenario |
|-----|------|---------------|
| REQ-001 | SPEC-001, SPEC-002, SPEC-003 | AC-001, AC-002, AC-003 |
| REQ-002 | SPEC-002 | AC-001 |
| REQ-003 | SPEC-001 (already rendered case) | AC-002 |
| REQ-004 | SPEC-003 | AC-004 |
| REQ-005 | SPEC-001, SPEC-002 | AC-003 |
| REQ-006 | SPEC-003 (guard clause) | AC-005 |
| REQ-007 | SPEC-003 (adaptive timeout) | AC-006 |

## Dependencies

### 내부 의존성

- `views/integrated-ui/view.js` - 메인 파일
- `views/integrated-ui/__tests__/view.characterization.test.js` - 기존 테스트

### 외부 의존성

- Obsidian API
- Dataview Plugin API
- MutationObserver Web API
- requestIdleCallback Web API

## References

- [EARS Format Specification](https://wwwRequirementsEngineering.com/ears/)
- [MoAI Foundation Core - TRUST 5](../.claude/skills/moai-foundation-core/modules/trust-5-framework.md)
- [SPEC-TTS-AUTOMOVE-001](.moai/specs/SPEC-TTS-AUTOMOVE-001/spec.md) - 관련 TTS 기능
- [Obsidian Plugin Documentation](https://github.com/obsidianmd/obsidian-api)
