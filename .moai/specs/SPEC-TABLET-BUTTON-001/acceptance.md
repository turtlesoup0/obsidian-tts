# SPEC-TABLET-BUTTON-001: 인수 기준

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TABLET-BUTTON-001
Format: Given-When-Then (Gherkin)
Test_Coverage_Target: 85%
Related: spec.md, plan.md
```

## Overview

이 문서는 SPEC-TABLET-BUTTON-001의 인수 기준을 Given-When-Then 형식으로 정의합니다. Obsidian의 특수한 환경(Electron, Capacitor)을 고려한 크로스 플랫폼 테스트 시나리오를 포함합니다.

## Test Scenarios

### AC-001: 고성능 디바이스에서의 버튼 표시 (iPad/iPhone)

**Priority**: High
**REQ Coverage**: REQ-001, REQ-002, REQ-005

#### Scenario 1.1: iPad M1에서 빈 테이블이 아닌 경우 버튼 표시

```gherkin
GIVEN Obsidian iOS 앱이 iPad M1에서 실행 중이고
AND Dataview 플러그인이 활성화되어 있고
AND "기술사_출제예상 (통합, 서버동기화, 최적화).md" 노트가 열려 있고
AND Dataview 테이블에 1개 이상의 행이 포함되어 있을 때

WHEN 사용자가 노트를 열거나 스크롤하여 Dataview 렌더링이 완료되면

THEN 저장(📍 저장) 버튼이 표시되어야 하고
AND 이동(🎯) 버튼이 표시되어야 하고
AND TTS 자동이동 토글이 표시되어야 하고
AND 모든 버튼이 클릭 가능해야 하고
AND 버튼이 올바른 위치에 표시되어야 한다
```

**Test Method**:
1. iPad M1 디바이스 준비 (실제 기기 또는 시뮬레이터)
2. Obsidian iOS 앱 실행
3. 대상 노트 열기
4. 버튼 표시 확인 (스크린샷 또는 수동 확인)

**Expected Result**: 버튼이 2초 이내에 표시됨

---

#### Scenario 1.2: iPhone에서 빈 테이블이 아닌 경우 버튼 표시

```gherkin
GIVEN Obsidian iOS 앱이 iPhone에서 실행 중이고
AND Dataview 플러그인이 활성화되어 있고
AND Dataview 테이블에 5개의 행이 포함되어 있을 때

WHEN Dataview 렌더링이 완료되면

THEN 모든 버튼이 표시되어야 하고
AND 모바일 최적화된 아이콘으로 표시되어야 한다
```

**Test Method**: iPhone 실제 기기 테스트

---

#### Scenario 1.3: iPad에서 빈 테이블인 경우 버튼 비표시

```gherkin
GIVEN Obsidian iOS 앱이 iPad에서 실행 중이고
AND Dataview 테이블에 행이 없을 때

WHEN Dataview 렌더링이 완료되면

THEN 버튼이 생성되지 않아야 하고
AND 콘솔에 에러가 출력되지 않아야 한다
```

**Test Method**: 빈 Dataview 쿼리로 테스트

---

### AC-002: 저사양 디바이스에서의 기존 동작 유지 (Android)

**Priority**: High
**REQ Coverage**: REQ-001, REQ-003, REQ-006

#### Scenario 2.1: Android 태블릿에서 버튼 정상 표시

```gherkin
GIVEN Obsidian Android 앱이 Android 태블릿에서 실행 중이고
AND Dataview 테이블에 10개의 행이 포함되어 있고
AND 기존 버전에서 버튼이 정상 표시되었을 때

WHEN 새로운 코드로 Dataview 렌더링이 완료되면

THEN 버튼이 표시되어야 하고
AND 기존 동작과 동일한 위치에 표시되어야 하고
AND 기존 동작과 동일한 기능을 제공해야 한다
```

**Test Method**: A/B 테스트 (기존 버전 vs 새 버전)

**Regression Check**: 기존 동작 변경 없음

---

#### Scenario 2.2: Android 저사양 기기에서 느린 렌더링 처리

```gherkin
GIVEN Android 저사양 태블릿에서 실행 중이고
AND Dataview 렌더링이 500ms 이상 소요될 때

WHEN 행이 점진적으로 추가되면

THEN MutationObserver가 첫 번째 행 추가를 감지하고
AND 모든 행이 추가될 때까지 기다리지 않고
AND 첫 번째 행 추가 후 버튼을 표시해야 한다
```

**Test Method**: DevTools Network Throttling으로 렌더링 속도 조절

---

### AC-003: Race Condition 방지

**Priority**: High
**REQ Coverage**: REQ-001, REQ-005

#### Scenario 3.1: tbody만 존재하고 tr이 없는 경우

```gherkin
GIVEN Dataview 테이블이 렌더링 중이고
AND <tbody> 요소는 생성되었지만
AND 아직 <tr> 요소가 추가되지 않았을 때

WHEN MutationObserver가 트리거되면

THEN initUI()가 호출되지 않아야 하고
AND 버튼이 생성되지 않아야 하고
AND Observer가 계속 감지해야 한다
```

**Test Method**: MutationObserver 콜백에서 DOM 상태 로깅

---

#### Scenario 3.2: 빠른 렌더링에서의 안전한 초기화

```gherkin
GIVEN 고성능 디바이스(iPad M1)에서 실행 중이고
AND Dataview가 <tbody>와 <tr>을 동일한 프레임에 추가할 때

WHEN MutationObserver가 트리거되면

THEN <tr> 요소의 존재를 확인하고
AND rows.length > 0을 확인한 후에만
AND initUI()를 호출해야 한다
```

**Test Method**: Performance 패널로 렌더링 타임라인 분석

---

### AC-004: 브라우저 호환성

**Priority**: Medium
**REQ Coverage**: REQ-004

#### Scenario 4.1: requestIdleCallback 지원 브라우저 (Chrome, Safari)

```gherkin
GIVEN Chrome 또는 Safari 브라우저에서 실행 중이고
AND requestIdleCallback API가 지원될 때

WHEN 버튼 초기화가 예약되면

THEN requestIdleCallback을 사용해야 하고
AND timeout 옵션이 200ms로 설정되어야 한다
```

**Test Method**: Feature Detection 확인 및 API 호출 로깅

---

#### Scenario 4.2: requestIdleCallback 미지원 브라우저 (폴백)

```gherkin
GIVEN requestIdleCallback가 지원되지 않는 브라우저에서 실행 중일 때

WHEN 버튼 초기화가 예약되면

THEN setTimeout 폴백을 사용해야 하고
AND delay가 50ms로 설정되어야 한다
```

**Test Method**: 폴백 코드 경로 테스트

---

### AC-005: 중복 생성 방지

**Priority**: Medium
**REQ Coverage**: REQ-006

#### Scenario 5.1: 이미 초기화된 경우 스킵

```gherkin
GIVEN 버튼 UI가 이미 초기화되었고
AND .in-search-container 요소가 존재할 때

WHEN initUI()가 다시 호출되면

THEN "⚠️ initUI 중복 호출 방지" 메시지가 로그되고
AND 함수가 조기 리턴해야 하고
AND 버튼이 중복 생성되지 않아야 한다
```

**Test Method**: 다중 initUI() 호출 시도

---

#### Scenario 5.2: MutationObserver 재연결 방지

```gherkin
GIVEN MutationObserver가 이미 disconnect되었을 때

WHIN 다시 disconnect를 호출해도

THEN 에러가 발생하지 않아야 하고
AND Observer가 정상적으로 정리되어야 한다
```

**Test Method**: 다중 disconnect 호출 테스트

---

### AC-006: 성능 기준

**Priority**: Medium
**REQ Coverage**: REQ-007 (Optional)

#### Scenario 6.1: 고성능 디바이스에서의 빠른 버튼 표시

```gherkin
GIVEN iPad M1와 같은 고성능 디바이스에서 실행 중일 때

WHEN Dataview 렌더링이 완료되면

THEN 버튼이 300ms 이내에 표시되어야 한다 (P95)
```

**Test Method**: Performance API로 측정

---

#### Scenario 6.2: 저사양 디바이스에서의 적절한 타임아웃

```gherkin
GIVEN Android 저사양 태블릿에서 실행 중일 때

WHEN Dataview 렌더링이 완료되면

THEN 버튼이 1000ms 이내에 표시되어야 한다 (P95)
AND 재시도 메커니즘이 작동해야 한다
```

**Test Method**: Network Throttling으로 저사양 시뮬레이션

---

## Obsidian Platform-Specific Tests

### AC-007: Electron 환경 (Desktop)

**Priority**: Medium

#### Scenario 7.1: Desktop Obsidian 앱에서의 동작

```gherkin
GIVEN Obsidian Desktop 앱(Windows/Mac/Linux)이 실행 중이고
AND Electron 환경일 때

WHEN Dataview가 테이블을 렌더링하면

THEN 버튼이 정상 표시되어야 하고
AND Node.js API 사용 시 에러가 없어야 하고
AND 파일 시스템 접근이 정상이어야 한다
```

**Test Method**: Obsidian Desktop에서 실제 테스트

---

#### Scenario 7.2: Electron 업데이트 호환성

```gherkin
GIVEN 다른 버전의 Electron을 사용하는 Obsidian 버전에서

WHEN 코드가 실행되면

THEN 모든 버전에서 정상 작동해야 한다
```

**Test Method**: 여러 Obsidian 버전에서 테스트

---

### AC-008: Capacitor 환경 (Mobile)

**Priority**: High

#### Scenario 8.1: iOS WebView에서의 동작

```gherkin
GIVEN Obsidian iOS 앱이 iPad 또는 iPhone에서 실행 중이고
AND Capacitor를 통한 네이티브 브릿지가 활성화되어 있을 때

WHEN Dataview가 테이블을 렌더링하면

THEN 버튼이 정상 표시되어야 하고
AND WebView 제약사항을 준수해야 하고
AND 네이티브 기능과 충돌하지 않아야 한다
```

**Test Method**: iOS 시뮬레이터 또는 실제 기기 테스트

---

#### Scenario 8.2: Android WebView에서의 동작

```gherkin
GIVEN Obsidian Android 앱이 실행 중이고
AND Capacitor를 통한 네이티브 브릿지가 활성화되어 있을 때

WHEN Dataview가 테이블을 렌더링하면

THEN 버튼이 정상 표시되어야 하고
AND 기존 Android 동작과 호환되어야 한다
```

**Test Method**: Android 에뮬레이터 또는 실제 기기 테스트

---

#### Scenario 8.3: 앱 백그라운드/포그라운드 전환

```gherkin
GIVEN 모바일 Obsidian 앱이 실행 중이고
AND 버튼이 표시되어 있을 때

WHEN 사용자가 앱을 백그라운드로 전환했다가 포그라운드로 돌아오면

THEN 버튼이 여전히 표시되어야 있고
AND 기능이 정상 작동해야 한다
```

**Test Method**: visibilitychange 이벤트 시뮬레이션

---

## Cross-Platform Test Matrix

| Platform | Device | AC-001 | AC-002 | AC-003 | AC-004 | AC-005 | AC-006 | AC-007 | AC-008 |
|----------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| Desktop | Windows 11 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Desktop | macOS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Mobile | iPad M1 | ✓ | - | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| Mobile | iPhone 15 | ✓ | - | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| Mobile | Android Tablet | - | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ |

---

## Quality Gate Criteria

### 자동화된 테스트

- [ ] 모든 Given-When-Then 시나리오가 Jest/Vitest로 구현됨
- [ ] 최소 85% 코드 커버리지 달성
- [ ] 모든 유닛 테스트 통과
- [ ] 모든 통합 테스트 통과

### 수동 테스트

- [ ] iPad M1 실제 기기 테스트 통과
- [ ] iPhone 실제 기기 테스트 통과
- [ ] Android 태블릿 실제 기기 테스트 통과
- [ ] Desktop (Windows/macOS) 테스트 통과

### LSP 품질 게이트

- [ ] TypeScript/JavaScript 오류: 0개
- [ ] Lint 경고: 10개 이하
- [ ] 보안 경고: 0개

### 성능 기준

- [ ] 버튼 표시 지연시간 (P95): 500ms 이하
- [ ] 메모리 누수: 없음
- [ ] MutationObserver 정리: 항상 호출됨

---

## Test Execution Plan

### Phase 1: 로컬 개발 테스트

1. Chrome DevTools에서 기능 테스트
2. MutationObserver 동작 확인
3. Performance 패널로 렌더링 타이밍 분석

### Phase 2: Cross-Browser 테스트

1. Chrome, Safari, Firefox에서 테스트
2. requestIdleCallback 지원 확인
3. 폴백 동작 확인

### Phase 3: 실제 기기 테스트

1. iPad/iPhone 테스트 (Obsidian iOS 앱)
2. Android 태블릿 테스트 (Obsidian Android 앱)
3. Desktop 테스트 (Obsidian Desktop)

### Phase 4: 회귀 테스트

1. 기존 동작 변경 없음 확인
2. 성능 저하 없음 확인
3. 새로운 버그 없음 확인

---

## Definition of Done

- [ ] 모든 인수 기준(AC-001 ~ AC-008) 충족
- [ ] 모든 테스트 시나리오 통과
- [ ] 크로스 플랫폼 호환성 확인
- [ ] 성능 기준 충족
- [ ] 회귀 없음 확인
- [ ] 코드 커버리지 85% 이상
- [ ] LSP 품질 게이트 통과
- [ ] 문서화 완료
