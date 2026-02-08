# SPEC-OBSIDIAN-DV-ERROR-001: Implementation Plan

## 1. 구현 개요 (Implementation Overview)

### 1.1 목표 (Goals)

Dataviewjs 템플릿 기반 에러 로깅 시스템을 구축하여 다음을 달성:

1. **모바일/태블릿 지원**: DevTools 없이도 에러 캡처 가능
2. **중앙 설정 관리**: 노트별 설정 불필요, 플러그인 데이터에서 중앙 관리
3. **단일 라인 사용**: `dv.view('/error-catcher')` 한 줄로 활성화
4. **자동 메타데이터 감지**: Dataviewjs API로 노트 정보 자동 추출

### 1.2 범위 (Scope)

**포함 (In Scope):**
- Dataviewjs 템플릿 개발 (error-catcher.js)
- 플러그인 설정 관리 (선택 사항)
- 기존 로컬 서버와의 호환성 유지
- 모바일/태블릿 지원 검증

**제외 (Out of Scope):**
- 새로운 로컬 서버 개발 (기존 SPEC-OBSIDIAN-ERROR-LOG-001 활용)
- Claude API 통합 (기존 시스템 활용)
- Obsidian 네이티브 플러그인 개발 (Dataviewjs 의존)

---

## 2. 구현 마일스톤 (Implementation Milestones)

### Phase 1: 기본 템플릿 개발 (Primary Goal)

**목표:** Dataviewjs에서 작동하는 기본 에러 캡처 템플릿 구현

**작업 항목:**
1. error-catcher.js 템플릿 파일 생성
2. Dataviewjs Context 접근 구현 (dv.current(), app)
3. 자동 노트 메타데이터 감지
4. ErrorCatcher 클래스 적용 (기존 코드 재사용)
5. 템플릿 모듈 내보내기 (module.exports)

**완료 기준:**
- 노트에서 `dv.view('/error-catcher')` 호출 시 에러 캡처 활성화
- 노트 경로, 이름이 자동으로 감지됨
- 에러 발생 시 로컬 서버로 전송됨

**우선순위:** High

### Phase 2: 설정 관리 (Secondary Goal)

**목표:** 중앙 집중식 설정 관리 구현

**작업 항목:**
1. 플러그인 설정 저장소 설계 (.obsidian/plugins/obsidian-error-catcher/data.json)
2. 설정 로드/저장 유틸리티 구현
3. 기본 설정값 정의
4. 설정 UI 제공 (선택 사항)

**완료 기준:**
- serverUrl을 중앙에서 설정 가능
- 설정 변경 시 모든 노트에 반영됨
- 기본값이 올바르게 적용됨

**우선순위:** Medium

### Phase 3: 모바일 지원 검증 (Primary Goal)

**목표:** Obsidian Mobile에서 템플릿 동작 확인

**작업 항목:**
1. Obsidian Mobile (iOS/Android)에서 테스트
2. Dataviewjs 동작 확인
3. 에러 캡처 검증
4. 로컬 서버 연결 확인

**완료 기준:**
- iOS에서 에러 캡처 작동
- Android에서 에러 캡처 작동
- 로컬 서버로 에러 전송 성공

**우선순위:** High

### Phase 4: 사용자 경험 개선 (Optional Goal)

**목표:** 사용자 피드백 및 문서화

**작업 항목:**
1. 템플릿 로드 시 상태 표시 (dv.el() 사용)
2. 에러 발생 시 사용자 알림
3. 사용자 가이드 작성
4. Dataview 쿼리 예시 제공

**완료 기준:**
- 템플릿 활성화 시 시각적 피드백 제공
- 사용자 가이드 완료
- 예시 코드 제공

**우선순위:** Low

---

## 3. 기술 접근 방식 (Technical Approach)

### 3.1 템플릿 파일 구조

```
error-catcher.js
├── Dependencies Import
│   └── ErrorCatcher 클래스 (기존 코드 재사용)
├── Module Export
│   └── module.exports = (dv, options) => { ... }
├── Dataviewjs Context Access
│   ├── dv.current() - 노트 메타데이터
│   └── app - Obsidian App 인스턴스
├── Configuration Loading
│   └── .obsidian/plugins/obsidian-error-catcher/data.json
├── ErrorCatcher Initialization
│   ├── notePath 자동 감지
│   ├── noteName 자동 감지
│   └── 글로벌 에러 핸들러 등록
└── User Feedback
    └── dv.el()로 상태 표시
```

### 3.2 Dataviewjs API 활용

**노트 메타데이터 접근:**
```javascript
// 현재 노트 정보
const currentNote = dv.current();
const notePath = currentNote?.file?.path;
const noteName = currentNote?.file?.name;
const noteTags = currentNote?.file?.etags;

// Obsidian App 접근
const obsidianVersion = app?.version;
const vaultName = app?.vault?.getName();
```

**템플릿 내보내기:**
```javascript
module.exports = (dv, options) => {
  // 템플릿 로직
  return {
    catcher: errorCatcher,
    status: 'initialized'
  };
};
```

### 3.3 설정 관리 전략

**설정 파일 위치:**
```json
// .obsidian/plugins/obsidian-error-catcher/data.json
{
  "serverUrl": "http://localhost:4321",
  "enabled": true,
  "autoCapture": true,
  "maskSensitiveData": true,
  "version": "1.0.0"
}
```

**설정 로드 순서:**
1. 템플릿 옵션 (`dv.view('/error-catcher', { serverUrl: '...' })`)
2. 플러그인 설정 파일
3. 기본값

### 3.4 기존 코드 재사용

**ErrorCatcher 클래스:**
- 기존 `error-catcher/src/catcher.ts`를 JavaScript로 변환
- 템플릿 내에서 직접 사용
- 생성자 옵션을 Dataviewjs Context로 자동 채움

---

## 4. 파일 배치 (File Placement)

### 4.1 템플릿 파일

**옵션 A: Dataview 플러그인 폴더 (권장)**
```
.obsidian/plugins/dataview/error-catcher.js
```
- 장점: Dataview가 자동으로 로드
- 단점: Dataview 업데이트 시 파일 삭제 가능

**옵션 B: Vault 루트 scripts 폴더**
```
scripts/error-catcher.js
```
- 장점: 사용자가 직접 관리, 업데이트 영향 없음
- 단점: 수동으로 폴더 생성 필요

**옵션 C: 전용 플러그인 폴더**
```
.obsidian/plugins/obsidian-error-catcher/templates/error-catcher.js
```
- 장점: 전용 관리, 독립성
- 단점: 추가 플러그인 개발 필요

### 4.2 설정 파일

```
.obsidian/plugins/obsidian-error-catcher/
├── main.ts           # (선택) Obsidian 플러그인
├── data.json         # 설정 저장소
└── manifest.json     # 플러그인 매니페스트
```

---

## 5. 의존성 관리 (Dependency Management)

### 5.1 Dataview 플러그인

**버전:** 0.5.67+
**설치:** Obsidian Community Plugins
**검증:** Dataviewjs API 호환성 확인

### 5.2 기존 로컬 서버

**의존 SPEC:** SPEC-OBSIDIAN-ERROR-LOG-001
**API 호환성:**
- POST `/api/errors`
- WebSocket `/ws`
- 기존 데이터 구조 그대로 사용

---

## 6. 위험 완화 (Risk Mitigation)

### 6.1 기술적 위험

| 위험 | 영향 | 확률 | 완화 전략 |
|------|------|------|-----------|
| Dataviewjs API 변경 | 높음 | 중간 | 버전 고정, API 추적 |
| 모바일 Dataviewjs 제한 | 높음 | 낮음 | 모바일 테스트, fallback 준비 |
| 플러그인 데이터 접근 실패 | 중간 | 낮음 | 기본값 제공, 에러 핸들링 |

### 6.2 사용자 경험 위험

| 위험 | 영향 | 확률 | 완화 전략 |
|------|------|------|-----------|
| Dataview 미설치 | 높음 | 중간 | 설치 안내 제공 |
| 템플릿 경로 오류 | 중간 | 중간 | 다중 경로 지원 |
| 설정 복잡성 | 낮음 | 낮음 | 합리적 기본값 |

---

## 7. 롤백 계획 (Rollback Plan)

### 7.1 롤백 시나리오

**시나리오 A: Dataviewjs 호환성 문제**
- 조치: 기존 DevTools Console 방식 유지
- 대안: 두 가지 방식 모두 지원

**시나리오 B: 모바일 지원 불가**
- 조치: 데스크톱 전용으로 출시
- 계획: 모바일 지원은 향후 릴리스

**시나리오 C: 설정 동기화 실패**
- 조치: 템플릿 옵션만 사용
- 계획: 플러그인 설정은 선택 사항으로 변경

---

## 8. 테스트 계획 (Test Plan)

### 8.1 단위 테스트

- **템플릿 로딩:** dv.view() 호출 검증
- **메타데이터 감지:** dv.current() 반환값 검증
- **설정 로드:** data.json 읽기 검증

### 8.2 통합 테스트

- **End-to-End:** 노트 → 템플릿 → 에러 → 서버
- **다중 노트:** 여러 노트에서 동시 사용
- **설정 변경:** 설정 변경 시 동기화 확인

### 8.3 플랫폼 테스트

- **Desktop:** Windows, macOS, Linux
- **Mobile:** iOS (Obsidian Mobile), Android
- **Tablet:** iPadOS, Android Tablet

---

## 9. 배포 계획 (Deployment Plan)

### 9.1 배포 단계

**Phase 1: 알파 (내부 테스트)**
- 로컬 환경에서 템플릿 테스트
- 기본 기능 검증

**Phase 2: 베타 (제한적 사용자 테스트)**
- 소규모 사용자 그룹 테스트
- 피드백 수집 및 버그 수정

**Phase 3: 정식 출시**
- 문서 완료
- 사용자 가이드 배포

### 9.2 릴리스 노트 항목

1. Dataviewjs 템플릿 기반 에러 캡처
2. 자동 노트 메타데이터 감지
3. 중앙 설정 관리
4. 모바일/태블릿 지원
5. 단일 라인 사용법

---

## 10. 다음 단계 (Next Steps)

### 10.1 즉시 작업

1. Dataviewjs API 문서 검토
2. 기존 ErrorCatcher 코드를 JavaScript로 변환
3. error-catcher.js 프로토타입 개발
4. 로컬 환경에서 테스트

### 10.2 순차적 작업

1. 설정 관리 구현
2. 모바일 테스트
3. 사용자 가이드 작성
4. 베타 테스트 시작

### 10.3 향후 개선

1. Obsidian 네이티브 플러그인 개발
2. Dataview 쿼리 지원
3. 에러 대시보드 UI
4. 통계 및 분석 기능

---

## 11. 추적 태그 (Traceability Tags)

```yaml
tags:
  - spec-obsidian-dv-error
  - implementation-plan
  - dataviewjs
  - template-based
```

---

## 12. 변경 이력 (Change History)

| 버전 | 날짜 | 변경 사항 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2026-02-04 | 초기 계획 작성 | MoAI |
