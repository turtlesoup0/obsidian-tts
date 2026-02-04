# SPEC-TABLET-BUTTON-001: 구현 계획

## TAG BLOCK

```yaml
SPEC_ID: SPEC-TABLET-BUTTON-001
Related: spec.md, acceptance.md
Milestones: 3
TechStack: JavaScript (ES6+), Obsidian API, Dataview Plugin
```

## Implementation Strategy

### Phase 1: ANALYZE (DDD 분석)

**목표**: 현재 코드 동작을 이해하고 테스트 가능한 상태로 만들기

1. **코드 분석**
   - `waitForTable` MutationObserver 로직 분석
   - `initUI()` 함수의 조기 리턴 조건 확인
   - Dataview 렌더링 타이밍 프로파일링

2. **문제 재현**
   - iPad/iPhone 시뮬레이션 환경 설정
   - DevTools Performance 패널로 렌더링 타이밍 캡처
   - Race Condition 지점 확인

3. **의존성 매핑**
   - Dataview Plugin API 의존성 확인
   - Obsidian API 사용 부분 식별
   - 기존 테스트와의 연계 확인

---

### Phase 2: PRESERVE (행위 보존)

**목표**: Characterization Tests로 현재 동작 캡처

1. **기존 테스트 분석**
   ```javascript
   // views/integrated-ui/__tests__/view.characterization.test.js
   // 기존 테스트 확인 및 확장
   ```

2. **새로운 Characterization Tests 작성**
   - Android 태블릿 동작 캡처 (정상 작동)
   - Desktop 동작 캡처 (정상 작동)
   - iPad/iPhone 동작 캡처 (버그 재현)

3. **테스트 더블 준비**
   - Dataview Mock 객체
   - MutationObserver Mock
   - Obsidian API Mock

---

### Phase 3: IMPROVE (개선)

**목표**: Race Condition 수정 및 검증

### Priority Milestones

#### Milestone 1: 안전한 행 감지 로직 구현 (Primary)

**작업 항목**:
1. `waitForTable` MutationObserver 개선
   - `<tbody>`와 `<tr>` 분리 확인
   - `rows.length > 0` 명시적 체크

2. `scheduleUIInit()` 함수 생성
   - 초기화 로직 분리
   - 재시도 메커니즘 추가

3. 기존 가드 클로저 유지
   - 중복 생성 방지 확인

**파일 수정**:
- `views/integrated-ui/view.js` (lines 1146-1164)

---

#### Milestone 2: Obsidian 플랫폼별 테스트 전략 (Secondary)

**목표**: Obsidian의 특수한 환경(Electron, Capacitor)을 고려한 테스트 설계

**테스트 환경 구성**:

1. **Desktop (Electron) 테스트**
   - Obsidian Desktop 앱에서 실제 테스트
   - DevTools를 통한 렌더링 타이밍 확인
   - Node.js API 사용 시나리오 테스트

2. **iOS (iPad/iPhone) 테스트**
   - 옵션 A: Obsidian iOS 앱 (TestFlight 또는 App Store)
   - 옵션 B: Capacitor 빌드로 로컬 테스트
   - 옵션 C: Safari DevTools 웹 시뮬레이션

3. **Android 테스트**
   - Obsidian Android 앱 테스트
   - 기존 동작 회귀 확인

4. **Cross-Browser 테스트**
   - Chrome (Desktop 기반 Electron)
   - Safari (iOS 기반 WebView)
   - Firefox (대안 브라우저)

**테스트 데이터 준비**:
- 빈 Dataview 테이블 (행 없음)
- 소형 Dataview 테이블 (1-5행)
- 대형 Dataview 테이블 (100+행)
- 복잡한 Dataview 테이블 (GROUP BY, 정렬)

---

#### Milestone 3: 회귀 테스트 자동화 (Final)

**목표**: 향후 Race Condition 방지를 위한 자동화된 테스트

**테스트 자동화 전략**:

1. **유닛 테스트 (Jest/Vitest)**
   - MutationObserver 동작 테스트
   - `scheduleUIInit()` 재시지 로직 테스트
   - 다양한 DOM 상태 시뮬레이션

2. **통합 테스트**
   - Dataview Plugin과의 통합 테스트
   - Obsidian API Mock을 활용한 통합 테스트

3. **E2E 테스트 (Playwright)**
   - 실제 Obsidian 환경 시뮬레이션
   - 크로스 플랫폼 렌더링 테스트

**CI/CD 통합**:
- GitHub Actions로 자동화
- 다양한 플랫폼에서 병렬 실행

---

## Technical Approach

### 1. Race Condition 수정 전략

#### 문제 원인 (현재 코드)

```javascript
// 문제: tbody는 존재하지만 tr은 아직 추가되지 않은 시점에 initUI() 호출
const waitForTable = new MutationObserver(() => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (table?.querySelector('tbody tr')) {  // ⚠️ tbody만 있어도 true일 수 있음
        waitForTable.disconnect();
        initUI();  // 여기서 rows.length === 0으로 조기 리턴
    }
});
```

#### 해결 방안

```javascript
const waitForTable = new MutationObserver((mutations) => {
    const table = dvRef.container.querySelector('.table-view-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 0) {  // ✅ 실제 행 개수 확인
        waitForTable.disconnect();
        scheduleUIInit();
    }
});
```

**핵심 개선점**:
1. `<tbody>`와 `<tr>`을 분리하여 확인
2. `querySelectorAll('tr')`로 실제 행 개수 확인
3. `rows.length > 0` 명시적 체크

---

### 2. 초기화 스케줄링 함수

```javascript
/**
 * 안전한 UI 초기화 스케줄링
 * - 브라우저 호환성 고려 (requestIdleCallback vs setTimeout)
 * - 재시도 메커니즘 포함
 * - 중복 초기화 방지
 */
const scheduleUIInit = () => {
    const RETRY_DELAY = 100;
    const MAX_RETRIES = 10;
    let retryCount = 0;

    const init = () => {
        const table = dvRef.container.querySelector('.table-view-table');
        if (!table) {
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(init, RETRY_DELAY);
            }
            return;
        }

        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) {
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(init, RETRY_DELAY);
            }
            return;
        }

        // 모든 조건 충족, UI 초기화 실행
        initUI();
    };

    // 브라우저 호환성 고려
    if (window.requestIdleCallback) {
        requestIdleCallback(() => init(), { timeout: 200 });
    } else {
        setTimeout(() => init(), 50);
    }
};
```

---

### 3. Obsidian 플랫폼별 고려사항

#### Electron (Desktop)

```javascript
// Electron 환경 특성
const isElectron = typeof process !== 'undefined' && process.versions?.electron;

if (isElectron) {
    // Node.js API 접근 가능
    const fs = require('fs');
    // 더 빠른 렌더링 타임아웃 가능
    const timeout = 30;
}
```

#### Capacitor (iOS/Android)

```javascript
// Capacitor 환경 특성
const isCapacitor = typeof window.Capacitor !== 'undefined';

if (isCapacitor) {
    // 모바일 최적화
    const timeout = isIOS ? 200 : 150;  // iOS가 더 보수적

    // 배터리 최적화 고려
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // 앱이 다시 활성화될 때 재확인
            scheduleUIInit();
        }
    });
}
```

---

## Risk Management

### 식별된 위험

| 위험 | 영향 | 확률 | 완화 전략 |
|-----|------|------|----------|
| Dataview 렌더링 방식 변경 | 높음 | 낮음 | Dataview 버전 고정, API 변화 모니터링 |
| MutationObserver 호환성 문제 | 중간 | 낮음 | 표준 Web API, 폴백 제공 |
| iOS WebView 성능 저하 | 중간 | 중간 | 적응형 타임아웃, 재시도 메커니즘 |
| 중복 버튼 생성 | 낮음 | 중간 | 기존 가드 클로저 유지 |
| 메모리 누수 (Observer) | 중간 | 낮음 | disconnect 명시적 호출 |

---

## Test Strategy for Obsidian Environment

### Obsidian 환경 특성 테스트

Obsidian은 일반적인 웹브라우저와 다른 점이 있음:

1. **Electron 기반 (Desktop)**
   - Chromium V8 엔진 사용
   - Node.js API 접근 가능
   - 파일 시스템 직접 접근
   - 다른 프로세스와의 IPC 통신

2. **Capacitor 기반 (Mobile)**
   - 네이티브 WebView 사용
   - 네이티브 기능 브릿지
   - 배터리 최적화 메커니즘
   - 메모리 제약

### Cross-Platform Testing Matrix

| 플랫폼 | 테스트 방법 | 렌더링 속도 | 고려사항 |
|--------|-----------|------------|----------|
| Desktop (Electron) | Obsidian Desktop | 빠름 | Node.js API |
| iPad M1 | Obsidian iOS 앱 | 매우 빠름 | WebView 제약 |
| iPhone | Obsidian iOS 앱 | 빠름 | 작은 화면 |
| Android Tablet | Obsidian Android | 느림 | 다른 WebView |
| Chrome DevTools | 모바일 에뮬레이션 | 조절 가능 | 개발 편의성 |

### 테스트 시나리오

1. **빈 테이블** (행 없음)
   - 예상: 버튼 생성 안 됨, 에러 없음

2. **소형 테이블** (1-5행)
   - 예상: 모든 플랫폼에서 버튼 표시

3. **대형 테이블** (100+행)
   - 예상: 렌더링 완료 후 버튼 표시

4. **복잡한 테이블** (GROUP BY, 정렬)
   - 예상: 복잡한 구조에서도 버튼 표시

5. **동적 테이블** (필터링, 정렬 변경)
   - 예상: 변경 시 버튼 위치 유지

---

## Regression Test Plan

### 자동화된 회귀 테스트

```javascript
// tests/integrated-ui/table-button-regression.test.js

describe('Table Button Regression Tests', () => {
    describe('Cross-Platform Rendering', () => {
        test('should render buttons on fast device (iPad M1)', async () => {
            // 고성능 디바이스 시뮬레이션
            await simulateFastRendering();
            await waitForButtons();
            expect(buttons).toBeVisible();
        });

        test('should render buttons on slow device (Android Tablet)', async () => {
            // 저사양 디바이스 시뮬레이션
            await simulateSlowRendering();
            await waitForButtons();
            expect(buttons).toBeVisible();
        });
    });

    describe('Race Condition Prevention', () => {
        test('should not create buttons when table has no rows', async () => {
            await renderEmptyTable();
            expect(buttons).not.toBeVisible();
        });

        test('should not create duplicate buttons', async () => {
            await renderTable();
            await triggerMultipleInitCalls();
            expect(buttons.length).toBe(1);
        });
    });
});
```

### 수동 테스트 체크리스트

- [ ] iPad (M1)에서 버튼 표시 확인
- [ ] iPhone에서 버튼 표시 확인
- [ ] Android 태블릿에서 기존 동작 유지
- [ ] Desktop에서 기존 동작 유지
- [ ] 빈 테이블에서 에러 없음
- [ ] 대형 테이블에서 버튼 표시
- [ ] 중복 버튼 없음

---

## Definition of Done

- [ ] 모든 EARS 요구사항 구현됨
- [ ] 모든 Given-When-Then 시나리오 통과
- [ ] iPad/iPhone에서 버튼 정상 표시
- [ ] Android/Desktop에서 회귀 없음
- [ ] 코드 커버리지 85% 이상
- [ ] LSP 오류 0개, 경고 10개 이하
- [ ] 성능 기준 충족 (P95 < 500ms)
- [ ] 회귀 테스트 자동화됨
- [ ] 문서화 완료 (README, CHANGELOG)
