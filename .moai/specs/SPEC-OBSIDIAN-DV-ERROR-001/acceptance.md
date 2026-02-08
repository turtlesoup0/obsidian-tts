# SPEC-OBSIDIAN-DV-ERROR-001: Acceptance Criteria

## 1. 인수 기준 개요 (Acceptance Criteria Overview)

### 1.1 정의 완료 기준 (Definition of Done)

- [ ] 모든 필수 요구사항(REQ-U-001 ~ REQ-U-004)이 구현됨
- [ ] 모든 이벤트 기반 요구사항(REQ-E-001 ~ REQ-E-005)이 구현됨
- [ ] 모든 상태 기반 요구사항(REQ-S-001 ~ REQ-S-004)이 구현됨
- [ ] 단위 테스트가 작성되고 통과됨
- [ ] 통합 테스트가 작성되고 통과됨
- [ ] 모바일/태블릿 환경에서 테스트됨
- [ ] 사용자 가이드가 작성됨
- [ ] 기존 로컬 서버와의 호환성이 확인됨

### 1.2 품질 게이트 (Quality Gates)

| 항목 | 기준 | 측정 방법 |
|------|------|-----------|
| 기능 완성도 | 모든 Primary Goal 구현 | 마일스톤 체크리스트 |
| 모바일 지원 | iOS/Android에서 작동 | 실제 기기 테스트 |
| 호환성 | 기존 API와 호환 | API 테스트 |
| 사용성 | 단일 라인으로 활성화 가능 | 사용자 테스트 |
| 문서화 | 사용자 가이드 완료 | 문서 리뷰 |

---

## 2. 기능별 인수 기준 (Feature-Specific Acceptance Criteria)

### 2.1 템플릿 로딩 (Template Loading)

**AC-TEMP-001: 템플릿 파일 로드**

**Given** Dataview 플러그인이 설치되어 있고
**And** error-catcher.js 파일이 Vault에 존재할 때
**When** 사용자가 노트에서 `dv.view('/error-catcher')`를 호출하면
**Then** 템플릿이 성공적으로 로드되어야 한다
**And** 에러 캡처가 활성화되어야 한다

---

**AC-TEMP-002: 템플릿 옵션 전달**

**Given** 템플릿이 로드 가능한 상태이고
**When** 사용자가 `dv.view('/error-catcher', { serverUrl: 'http://localhost:8080' })`를 호출하면
**Then** 전달된 serverUrl 옵션이 적용되어야 한다
**And** 에러가 해당 URL로 전송되어야 한다

---

**AC-TEMP-003: 템플릿 경로 해석**

**Given** error-catcher.js 파일이 scripts 폴더에 있고
**When** 사용자가 `dv.view('/scripts/error-catcher')`를 호출하면
**Then** 템플릿이 성공적으로 로드되어야 한다
**And** 상대 경로와 절대 경로 모두 지원되어야 한다

---

### 2.2 자동 메타데이터 감지 (Automatic Metadata Detection)

**AC-META-001: 노트 경로 자동 감지**

**Given** 템플릿이 로드되었고
**And** 현재 노트가 `Projects/MyNote.md`일 때
**When** 템플릿이 초기화되면
**Then** dv.current().file.path에서 노트 경로가 자동으로 감지되어야 한다
**And** notePath가 `Projects/MyNote.md`로 설정되어야 한다

---

**AC-META-002: 노트 이름 자동 감지**

**Given** 템플릿이 로드되었고
**And** 현재 노트 파일명이 `MyNote.md`일 때
**When** 템플릿이 초기화되면
**Then** dv.current().file.name에서 노트 이름이 자동으로 감지되어야 한다
**And** noteName이 `MyNote`로 설정되어야 한다

---

**AC-META-003: Obsidian 버전 감지**

**Given** 템플릿이 로드되었고
**And** Obsidian 앱 인스턴스에 접근 가능할 때
**When** 템플릿이 초기화되면
**Then** app.version에서 Obsidian 버전이 감지되어야 한다
**And** 버전 정보가 에러 컨텍스트에 포함되어야 한다

---

### 2.3 에러 캡처 (Error Capture)

**AC-ERR-001: 글로벌 에러 핸들러 등록**

**Given** 템플릿이 로드되었고
**And** autoCapture 옵션이 true일 때
**When** 템플릿이 초기화되면
**Then** window.onerror 핸들러가 등록되어야 한다
**And** unhandledrejection 핸들러가 등록되어야 한다

---

**AC-ERR-002: JavaScript 에러 캡처**

**Given** 에러 핸들러가 등록되어 있고
**When** 노트에서 `throw new Error('Test error')`가 실행되면
**Then** 에러가 캡처되어야 한다
**And** 에러 데이터가 서버로 전송되어야 한다
**And** notePath와 noteName이 자동으로 포함되어야 한다

---

**AC-ERR-003: Promise Rejection 캡처**

**Given** 에러 핸들러가 등록되어 있고
**When** 처리되지 않은 Promise가 reject되면
**Then** rejection이 캡처되어야 한다
**And** rejection 이유가 서버로 전송되어야 한다

---

### 2.4 설정 관리 (Configuration Management)

**AC-CONF-001: 플러그인 설정 로드**

**Given** .obsidian/plugins/obsidian-error-catcher/data.json 파일이 존재하고
**And** 파일에 serverUrl이 설정되어 있을 때
**When** 템플릿이 초기화되면
**Then** 설정 파일이 로드되어야 한다
**And** serverUrl이 적용되어야 한다

---

**AC-CONF-002: 기본값 적용**

**Given** 설정 파일이 존재하지 않고
**When** 템플릿이 초기화되면
**Then** 기본 serverUrl인 'http://localhost:4321'이 적용되어야 한다
**And** 기본 enabled가 true여야 한다
**And** 기본 autoCapture가 true여야 한다

---

**AC-CONF-003: 옵션 우선순위**

**Given** 설정 파일에 serverUrl이 'http://localhost:4321'로 설정되어 있고
**When** 사용자가 `dv.view('/error-catcher', { serverUrl: 'http://localhost:8080' })`를 호출하면
**Then** 템플릿 옵션이 설정 파일보다 우선되어야 한다
**And** serverUrl이 'http://localhost:8080'이어야 한다

---

### 2.5 모바일 지원 (Mobile Support)

**AC-MOB-001: iOS Dataviewjs 지원**

**Given** Obsidian Mobile (iOS)가 설치되어 있고
**And** Dataview 플러그인이 활성화되어 있을 때
**When** 사용자가 노트에서 `dv.view('/error-catcher')`를 호출하면
**Then** 템플릿이 성공적으로 로드되어야 한다
**And** 에러 캡처가 작동해야 한다

---

**AC-MOB-002: Android Dataviewjs 지원**

**Given** Obsidian Mobile (Android)가 설치되어 있고
**And** Dataview 플러그인이 활성화되어 있을 때
**When** 사용자가 노트에서 `dv.view('/error-catcher')`를 호출하면
**Then** 템플릿이 성공적으로 로드되어야 한다
**And** 에러 캡처가 작동해야 한다

---

**AC-MOB-003: 모바일 에러 전송**

**Given** 모바일 환경에서 템플릿이 로드되었고
**And** 로컬 서버가 실행 중일 때
**When** 에러가 발생하면
**Then** 에러가 서버로 성공적으로 전송되어야 한다
**And** platform이 'mobile'로 식별되어야 한다

---

### 2.6 오프라인 큐잉 (Offline Queuing)

**AC-OFF-001: 오프라인 상태 감지**

**Given** 템플릿이 로드되었고
**And** 로컬 서버가 실행 중이지 않을 때
**When** 템플릿이 초기화되면
**Then** 서버 연결 상태가 'offline'으로 감지되어야 한다
**And** 오프라인 모드가 활성화되어야 한다

---

**AC-OFF-002: 오프라인 에러 큐잉**

**Given** 서버가 오프라인 상태이고
**When** 에러가 발생하면
**Then** 에러가 로컬 스토리지에 저장되어야 한다
**And** 큐에 에러가 추가되어야 한다
**And** 사용자에게 오프라인 상태가 알려져야 한다

---

**AC-OFF-003: 재접속 시 전송**

**Given** 오프라인 상태에서 에러가 큐에 저장되어 있고
**When** 서버가 다시 실행되면
**Then** 큐에 저장된 모든 에러가 일괄 전송되어야 한다
**And** 큐가 비워져야 한다

---

### 2.7 보안 (Security)

**AC-SEC-001: 민감 정보 마스킹**

**Given** 에러에 비밀번호가 포함되어 있고
**When** 에러가 캡처되면
**Then** 비밀번호가 '***MASKED***'로 마스킹되어야 한다
**And** 마스킹된 데이터만 서버로 전송되어야 한다

---

**AC-SEC-002: 로컬 통신만 허용**

**Given** 템플릿이 로드되었고
**When** 에러가 전송될 때
**Then** localhost (127.0.0.1)로만 전송되어야 한다
**And** 외부 서버로는 전송되지 않아야 한다

---

### 2.8 사용자 피드백 (User Feedback)

**AC-UF-001: 활성화 상태 표시**

**Given** 템플릿이 성공적으로 로드되었을 때
**When** 초기화가 완료되면
**Then** 노트에 "Error Catcher 활성화: [노트 경로]" 메시지가 표시되어야 한다
**And** 메시지가 읽기 전용으로 표시되어야 한다

---

**AC-UF-002: 에러 발생 알림**

**Given** 에러 핸들러가 등록되어 있고
**When** 에러가 캡처되면
**Then** 콘솔에 에러 ID와 함께 로그가 출력되어야 한다
**And** (선택) 사용자에게 시각적 알림이 표시될 수 있다

---

**AC-UF-003: Dataview 미설치 안내**

**Given** Dataview 플러그인이 설치되어 있지 않고
**When** 사용자가 노트를 열면
**Then** Dataview 설치 안내가 표시되어야 한다
**And** 설치 링크가 제공되어야 한다

---

## 3. 통합 테스트 시나리오 (Integration Test Scenarios)

### 3.1 엔드투엔드 시나리오

**SCENARIO-E2E-001: 기본 에러 캡처 플로우**

**Given** Dataview 플러그인이 설치되어 있고
**And** error-catcher.js 파일이 Vault에 존재하고
**And** 로컬 서버가 실행 중이고
**And** 사용자가 노트를 열었을 때

**When** 사용자가 노트에 다음을 입력한다:
````markdown
```dataviewjs
dv.view('/scripts/error-catcher')
```
````

**And** 노트에서 다음 코드를 실행한다:
```javascript
throw new Error('Test error');
```

**Then** 다음이 발생해야 한다:
1. 템플릿이 성공적으로 로드된다
2. "Error Catcher 활성화" 메시지가 표시된다
3. 에러가 캡처된다
4. 에러가 서버로 전송된다
5. notePath와 noteName이 자동으로 포함된다

---

**SCENARIO-E2E-002: 모바일 에러 캡처 플로우**

**Given** Obsidian Mobile이 설치되어 있고
**And** Dataview 플러그인이 활성화되어 있고
**And** error-catcher.js 파일이 동기화되어 있고
**And** 로컬 서버가 같은 네트워크에서 실행 중일 때

**When** 사용자가 모바일에서 노트를 열고
**And** `dv.view('/scripts/error-catcher')`를 호출하고
**And** 에러를 발생시킨다

**Then** 다음이 발생해야 한다:
1. 템플릿이 성공적으로 로드된다
2. 에러가 캡처된다
3. 에러가 서버로 전송된다
4. platform이 'mobile'로 식별된다

---

**SCENARIO-E2E-003: 오프라인 큐잉 플로우**

**Given** 템플릿이 로드되어 있고
**And** 로컬 서버가 실행 중이지 않을 때

**When** 사용자가 에러를 발생시킨다

**Then** 다음이 발생해야 한다:
1. 에러가 로컬 스토리지에 저장된다
2. "오프라인 모드: 에러가 큐에 저장됨" 메시지가 표시된다

**When** 사용자가 로컬 서버를 다시 시작한다

**Then** 다음이 발생해야 한다:
1. 큐에 저장된 에러가 서버로 전송된다
2. "큐에서 X개 에러 전송 완료" 메시지가 표시된다

---

### 3.2 설정 관리 시나리오

**SCENARIO-CONF-001: 중앙 설정 사용**

**Given** .obsidian/plugins/obsidian-error-catcher/data.json이 존재하고
**And** serverUrl이 'http://localhost:8080'으로 설정되어 있을 때

**When** 사용자가 노트 A에서 `dv.view('/scripts/error-catcher')`를 호출하고
**And** 사용자가 노트 B에서 `dv.view('/scripts/error-catcher')`를 호출하고
**And** 에러가 발생한다

**Then** 다음이 발생해야 한다:
1. 두 노트 모두 같은 serverUrl을 사용한다
2. 에러가 'http://localhost:8080'으로 전송된다

**When** 사용자가 설정을 'http://localhost:4321'로 변경한다

**Then** 다음에 발생하는 에러는 새로운 URL로 전송된다

---

## 4. 비기능적 인수 기준 (Non-Functional Acceptance Criteria)

### 4.1 성능 (Performance)

**AC-PERF-001: 템플릿 로드 시간**

**Given** 표준적인 네트워크 환경에서
**When** 사용자가 `dv.view('/error-catcher')`를 호출하면
**Then** 템플릿이 500ms 이내에 로드되어야 한다

---

**AC-PERF-002: 메타데이터 감지 시간**

**Given** 템플릿이 로드 가능한 상태에서
**When** dv.current()가 호출되면
**Then** 메타데이터가 100ms 이내에 감지되어야 한다

---

**AC-PERF-003: 에러 캡처 지연**

**Given** 에러 핸들러가 등록되어 있고
**When** 에러가 발생하면
**Then** 에러가 100ms 이내에 캡처되어야 한다

---

### 4.2 호환성 (Compatibility)

**AC-COMP-001: Obsidian 버전 호환성**

**Given** Obsidian 1.5.0 이상이 설치되어 있을 때
**When** 템플릿이 로드되면
**Then** 모든 기능이 정상 작동해야 한다

---

**AC-COMP-002: Dataview 버전 호환성**

**Given** Dataview 0.5.67 이상이 설치되어 있을 때
**When** 템플릿이 로드되면
**Then** dv.view()가 정상 작동해야 한다

---

**AC-COMP-003: 기존 API 호환성**

**Given** 기존 로컬 서버가 실행 중이고
**When** 템플릿이 에러를 전송하면
**Then** 기존 API 엔드포인트와 호환되어야 한다
**And** 데이터 구조가 기존과 동일해야 한다

---

### 4.3 사용성 (Usability)

**AC-USE-001: 단일 라인 활성화**

**Given** Dataview가 설치되어 있고
**And** error-catcher.js가 Vault에 존재할 때
**When** 사용자가 한 줄의 코드(`dv.view('/error-catcher')`)를 추가하면
**Then** 에러 캡처가 활성화되어야 한다
**And** 추가 설정 없이 작동해야 한다

---

**AC-USE-002: 명확한 피드백**

**Given** 템플릿이 로드되었을 때
**When** 초기화가 완료되면
**Then** 사용자에게 명확한 상태 메시지가 표시되어야 한다
**And** 에러 발생 시 콘솔 로그가 제공되어야 한다

---

## 5. 품질 게이트 검증 (Quality Gate Validation)

### 5.1 테스트 커버리지

| 항목 | 커버리지 목표 | 측정 방법 |
|------|--------------|-----------|
| 기능적 요구사항 | 100% | 모든 AC 테스트 통과 |
| 단위 테스트 | 80%+ | 코드 커버리지 도구 |
| 통합 테스트 | 100% | 모든 시나리오 통과 |
| 플랫폼 테스트 | 100% | 데스크톱/모바일 전체 |

### 5.2 버그 허용 기준

| 심각도 | 허용 개수 | 예시 |
|--------|----------|------|
| Critical | 0 | 데이터 손실, 보안 문제 |
| High | 0 | 기능 작동 불가 |
| Medium | 2 | 워크어라운드 가능 |
| Low | 5 | UI 미세한 문제 |

### 5.3 사용자 승인 기준

- [ ] 모바일 사용자가 DevTools 없이 에러를 캡처할 수 있다
- [ ] 단일 라인 코드로 에러 캡처를 활성화할 수 있다
- [ ] 노트별 설정이 필요 없다
- [ ] 설정을 중앙에서 관리할 수 있다
- [ ] 기존 로컬 서버와 호환된다

---

## 6. 검증 방법 (Verification Methods)

### 6.1 자동화된 테스트

- **단위 테스트:** Jest 또는 Vitest로 템플릿 함수 테스트
- **통합 테스트:** Playwright로 E2E 시나리오 테스트
- **API 테스트:** Supertest로 로컬 서버 연동 테스트

### 6.2 수동 테스트

- **모바일 테스트:** 실제 iOS/Android 기기에서 테스트
- **사용성 테스트:** 베타 사용자 그룹 테스트
- **호환성 테스트:** 다양한 Obsidian/Dataview 버전에서 테스트

### 6.3 사용자 검증

- **베타 테스트:** 10~20명 사용자 그룹
- **피드백 수집:** 설문조사 및 인터뷰
- **버그 리포트:** GitHub Issues로 수집

---

## 7. 추적 태그 (Traceability Tags)

```yaml
tags:
  - spec-obsidian-dv-error
  - acceptance-criteria
  - test-scenarios
  - quality-gates
```

---

## 8. 변경 이력 (Change History)

| 버전 | 날짜 | 변경 사항 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2026-02-04 | 초기 인수 기준 작성 | MoAI |
