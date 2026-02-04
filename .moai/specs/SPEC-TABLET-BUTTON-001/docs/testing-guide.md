# Obsidian 크로스 플랫폼 테스트 가이드

## 개요

이 가이드는 SPEC-TABLET-BUTTON-001의 Race Condition 수정을 검증하기 위한 Obsidian 플러그인 테스트 방법을 설명합니다.

## 테스트 환경

### Obsidian 플랫폼 특성

Obsidian은 일반적인 웹브라우저와 다른 실행 환경을 가집니다:

#### 1. Desktop (Electron)

```javascript
// 환경 특성
{
    runtime: 'Electron',
    engine: 'Chromium V8',
    features: [
        'Node.js API 접근',
        '파일 시스템 직접 접근',
        'IPC 통신'
    ]
}

// 테스트 방법
1. Obsidian Desktop 앱 실행
2. 개발자 콘솔 (Ctrl+Shift+I)
3. Console 로그로 렌더링 타이밍 확인
```

#### 2. Mobile (Capacitor)

```javascript
// iOS (iPad/iPhone)
{
    runtime: 'Capacitor iOS',
    engine: 'WebKit (WKWebView)',
    constraints: [
        'WebView 메모리 제약',
        '배터리 최적화',
        'requestIdleCallback 지원'
    ]
}

// Android
{
    runtime: 'Capacitor Android',
    engine: 'Chrome WebView',
    constraints: [
        '다른 렌더링 타이밍',
        '저사양 디바이스 고려'
    ]
}
```

#### 3. Dataview 플러그인 렌더링 특성

```javascript
// Dataview는 비동기로 렌더링됨
{
    rendering: 'asynchronous',
    detection: 'MutationObserver',
    variability: '디바이스 성능에 따른 속도 차이'
}

// 렌더링 프로세스
Dataview 렌더링 시작
    ↓
<table> 생성
    ↓
<thead> 생성
    ↓
<tbody> 생성  ← 첫 번째 MutationObserver 트리거 가능 지점
    ↓
<tr> 요소 추가  ← 두 번째 MutationObserver 트리거 가능 지점
    ↓
데이터 채워짐
```

## 테스트 시나리오

### AC-001: iPad 고성능 디바이스에서 버튼 표시

**Given**: iPad M1 프로세서, Obsidian iOS 앱
```javascript
const testEnvironment = {
    device: 'iPad M1',
    platform: 'iOS',
    obsidianVersion: '1.5.0+',
    dataviewVersion: '0.5.60+'
};
```

**When**: 통합 노트가 로드됨
```javascript
// 테스트 단계
1. '기술사_출제예상 (통합, 서버동기화, 최적화).md' 노트 열기
2. Dataview 테이블 렌더링 대기
3. MutationObserver 콜백 실행
```

**Then**: 버튼이 정상 표시됨
```javascript
// 검증
const buttons = {
    save: document.querySelector('.tts-save-button'),
    move: document.querySelector('.tts-move-button'),
    tts: document.querySelector('.tts-play-button')
};

assert(buttons.save !== null, '저장 버튼 존재');
assert(buttons.move !== null, '이동 버튼 존재');
assert(buttons.tts !== null, 'TTS 버튼 존재');
```

### AC-002: Android 태블릿 저사양에서 기존 동작 유지

**Given**: Android 저사양 태블릿
```javascript
const testEnvironment = {
    device: 'Generic Android Tablet',
    platform: 'Android',
    performance: 'low'
};
```

**When**: 통합 노트가 로드됨

**Then**: 버튼이 정상 표시되고 회귀 없음
```javascript
// 회귀 테스트
const beforeFix = {
    androidButtonVisible: true
};

const afterFix = {
    androidButtonVisible: true
};

assert(afterFix === beforeFix, 'Android 동작 변경 없음');
```

### AC-003: 빈 테이블에서 안전한 무시

**Given**: Dataview 테이블에 데이터가 없음
```javascript
const emptyTableState = {
    tbody: '<tbody></tbody>',
    rows: 0
};
```

**When**: MutationObserver가 트리거됨

**Then**: UI 초기화가 실행되지 않음
```javascript
// 검증
let initUICalled = false;

const originalInitUI = window.initUI;
window.initUI = () => { initUICalled = true; };

// 빈 테이블로 테스트
const tbody = document.querySelector('tbody');
const rows = tbody.querySelectorAll('tr');

if (tbody && rows.length > 0) {
    initUI();
}

assert(initUICalled === false, '빈 테이블에서 initUI 미호출');
```

### AC-004: requestIdleCallback 브라우저 호환성

**Given**: 다양한 브라우저 환경
```javascript
const browsers = [
    { name: 'Chrome', supportsRIC: true },
    { name: 'Safari iOS', supportsRIC: true },
    { name: 'Firefox', supportsRIC: true },
    { name: 'Older Browser', supportsRIC: false }
];
```

**When**: UI 초기화가 스케줄링됨

**Then**: 지원되는 API가 사용됨
```javascript
// 폴백 로직 테스트
const scheduleUIInit = () => {
    if (window.requestIdleCallback) {
        return 'requestIdleCallback 사용';
    } else {
        return 'setTimeout 폴백 사용';
    }
};

browsers.forEach(browser => {
    const result = scheduleUIInit();
    console.log(`${browser.name}: ${result}`);
});
```

## Obsidian 특정 테스트 방법

### 1. 개발자 콘솔을 이용한 렌더링 타이밍 확인

```javascript
// Obsidian 개발자 콘솔에서 실행

// 1. MutationObserver 로그 추가
const originalLog = console.log;
console.log = (...args) => {
    if (args[0]?.includes?.('[RaceCondition]')) {
        originalLog('[TIMING]', performance.now(), ...args);
    }
};

// 2. Dataview 렌더링 감지
const observeDataview = () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.classList?.contains('table-view-table')) {
                        console.log('[Dataview] Table rendered at:', performance.now());
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
};

observeDataview();
```

### 2. Capacitor 빌드를 이용한 모바일 테스트

```bash
# Obsidian 모바일 앱 빌드 ( Capacitor 기반)
# 참고: 실제 Obsidian 모바일 앱은 App Store에서 다운로드

# 개발 중 테스트를 위한 Capacitor 설정
npm install @capacitor/core @capacitor/ios @capacitor/android

# iOS 시뮬레이터에서 테스트
npx cap sync ios
npx cap open ios

# Android 에뮬레이터에서 테스트
npx cap sync android
npx cap open android
```

### 3. Chrome DevTools 모바일 에뮬레이션

```javascript
// Chrome DevTools에서 모바일 디바이스 시뮬레이션

// 1. 개발자 도구 열기 (F12)
// 2. Device 툴바 토글 (Ctrl+Shift+M)
// 3. 디바이스 선택: iPad Pro, iPhone 14 Pro
// 4. CPU 스로틀링: 6x slowdown (저사양 시뮬레이션)

// Network 조절으로 느린 렌더링 시뮬레이션
// Network 탭 → Throttling → Slow 3G
```

## 단위 테스트 작성

### Jest + Testing Library

```javascript
// views/integrated-ui/__tests__/view.race-condition.test.js

describe('Race Condition Fix', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    test('REQ-001: tbody만 있고 tr이 없을 때 initUI 미호출', () => {
        // Given: tbody만 존재
        container.innerHTML = '<table><tbody></tbody></table>';

        // When: 확인 로직 실행
        const table = container.querySelector('table');
        const tbody = table?.querySelector('tbody');
        const rows = tbody?.querySelectorAll('tr') ?? [];

        // Then: initUI 미호출
        expect(tbody).toBeTruthy();
        expect(rows.length).toBe(0);
    });

    test('REQ-002: 첫 번째 tr 추가 시 initUI 호출', () => {
        // Given: 빈 테이블
        container.innerHTML = '<table><tbody></tbody></table>';
        let initUICalled = false;

        // When: tr 추가
        const tbody = container.querySelector('tbody');
        const tr = document.createElement('tr');
        tbody.appendChild(tr);

        const rows = tbody.querySelectorAll('tr');
        if (rows.length > 0) {
            initUICalled = true;
        }

        // Then: initUI 호출
        expect(initUICalled).toBe(true);
    });
});
```

## 통합 테스트

### E2E 테스트 (Playwright)

```javascript
// e2e/race-condition.spec.js

import { test, expect } from '@playwright/test';

test.describe('Tablet Button Race Condition', () => {
    test('iPad M1에서 버튼 표시', async ({ page }) => {
        // iPad M1 에뮬레이션
        await page.setViewportSize({ width: 1024, height: 1366 });
        await page.emulateMedia({ type: 'screen' });

        // 노트 로드
        await page.goto('obsidian://open?vault=TestVault&file=TestNote');

        // 버튼 대기
        const saveButton = page.locator('.tts-save-button');
        await expect(saveButton).toBeVisible({ timeout: 2000 });
    });

    test('저사양 디바이스에서 버튼 표시', async ({ page }) => {
        // CPU 스로틀링으로 저사양 시뮬레이션
        await page.routeFromHAR(
            './low-performance.har',
            { update: false }
        );

        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('obsidian://open?vault=TestVault&file=TestNote');

        const saveButton = page.locator('.tts-save-button');
        await expect(saveButton).toBeVisible({ timeout: 5000 });
    });
});
```

## 성능 테스트

### 렌더링 시간 측정

```javascript
// 성능 측정 스크립트

const measureRendering = () => {
    const startTime = performance.now();

    const observer = new MutationObserver((mutations) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(`[Performance] Rendering took ${duration}ms`);

        if (duration > 500) {
            console.warn('[Performance] Rendering exceeds 500ms threshold');
        }
    });

    return observer;
};

// 테스트 실행
const perfObserver = measureRendering();
perfObserver.observe(document.body, { childList: true, subtree: true });
```

## 테스트 체크리스트

### 기능 테스트

- [ ] iPad M1에서 버튼 정상 표시
- [ ] iPhone에서 버튼 정상 표시
- [ ] Android Tablet에서 기존 동작 유지
- [ ] Desktop에서 기존 동작 유지
- [ ] 빈 테이블에서 안전한 무시

### 호환성 테스트

- [ ] Obsidian 최신 버전 (1.5.0+)
- [ ] Obsidian 이전 버전 (1.4.0)
- [ ] Dataview 최신 버전
- [ ] iOS 15+ (requestIdleCallback 지원)
- [ ] Android 10+

### 성능 테스트

- [ ] 버튼 표시까지 500ms 이하 (P95)
- [ ] MutationObserver 메모리 누수 없음
- [ ] 중복 초기화 방지 확인

### 회귀 테스트

- [ ] 기존 TTS 기능 정상 작동
- [ ] 버튼 클릭 동작 정상
- [ ] 다른 플러그인과 충돌 없음

## 문제 해결 가이드

### 일반적인 문제

**문제**: 버튼이 여전히 표시되지 않음

**해결**:
1. 개발자 콘솔에서 `[RaceCondition]` 로그 확인
2. `rows.length` 값 확인
3. Dataview 버전 확인 (0.5.60+ 필요)

**문제**: Android에서 버튼 중복 생성

**해결**:
1. 가드 클로저(`table.parentNode.querySelector('.in-search-container')`) 확인
2. MutationObserver `disconnect()` 호출 확인

---

작성일: 2026-02-04
버전: 1.0.0
