# SPEC-OBSIDIAN-ERROR-LOG-001: 인수 기준

## 추적성 (Traceability)

**SPEC ID**: SPEC-OBSIDIAN-ERROR-LOG-001
**관련 문서**: `spec.md`, `plan.md`

---

## 1. 인수 기준 개요 (Acceptance Criteria Overview)

### 1.1 정의 완료 (Definition of Done)

모든 작업 항목은 다음 기준을 충족해야 완료로 간주됩니다:

- [ ] 모든 기능 요구사항 구현 완료
- [ ] 단위 테스트 통과 (85% 이상 커버리지)
- [ ] 통합 테스트 통과
- [ ] E2E 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 문서화 완료
- [ ] 보안 검증 통과
- [ ] 성능 기준 충족

### 1.2 품질 게이트 (Quality Gates)

| 게이트 | 기준 | 측정 방법 |
|--------|------|-----------|
| **에러 감지율** | 95% 이상 | 테스트 에러 발생 대비 캡처 수 |
| **분석 정확도** | 80% 이상 | Claude 분석 결과 정확성 검증 |
| **자동 수정 성공률** | 70% 이상 | 안전한 수정 대비 성공 수 |
| **서버 가동 시간** | 99% 이상 | 7일 연속 운영 테스트 |
| **응답 시간** | 200ms 이하 | P95 응답 시간 측정 |

---

## 2. 기능별 인수 기준 (Functional Acceptance Criteria)

### 2.1 에러 캡처 (Error Capture)

#### AC-CAP-001: 글로벌 에러 핸들링

**Given** Obsidian 노트가 열려 있고 에러 캐처가 초기화된 상태
**When** JavaScript 에러가 발생하면
**Then** 에러가 자동으로 캡처되어야 한다

**테스트 케이스:**
| 시나리오 | Given | When | Then |
|----------|--------|------|------|
| 정상 에러 캡처 | 에러 캐처 활성화 | `ReferenceError` 발생 | 에러 객체 캡처됨 |
| Promise Reject | 에러 캐처 활성화 | 처리되지 않은 Promise reject | reject 이유 캡처됨 |
| 비동기 에러 | 에러 캐처 활성화 | `setTimeout` 내 에러 | 에러 캡처됨 |

#### AC-CAP-002: 에러 메타데이터 수집

**Given** 에러가 캡처된 상태
**When** 에러 데이터가 생성되면
**Then** 다음 정보가 포함되어야 한다:
- 에러 ID (UUID)
- 타임스탬프
- 노트 ID 및 경로
- 에러 유형
- 에러 메시지
- 스택 트레이스
- 실행 컨텍스트

**검증 방법:**
```javascript
const errorCapture = {
  id: 'string (uuid v4)',
  timestamp: 'number (unix timestamp)',
  noteId: 'string',
  notePath: 'string',
  errorType: 'string (enum)',
  message: 'string',
  stackTrace: 'string (optional)',
  context: {
    userAgent: 'string',
    obsidianVersion: 'string',
    platform: 'desktop | mobile | tablet'
  }
};
```

#### AC-CAP-003: 오프라인 큐잉

**Given** 로컬 서버가 실행 중이지 않은 상태
**When** 에러가 발생하면
**Then** 에러가 로컬 큐에 저장되어야 한다

**Given** 로컬 서버가 재시작된 상태
**When** 에러 캐처가 재연결되면
**Then** 큐에 저장된 에러가 일괄 전송되어야 한다

---

### 2.2 로컬 서버 (Local Server)

#### AC-SRV-001: HTTP API 엔드포인트

**Given** 로컬 서버가 실행 중인 상태
**When** 클라이언트가 POST `/api/errors`를 요청하면
**Then** 에러가 저장되고 201 상태 코드가 반환되어야 한다

**Given** 로컬 서버가 실행 중인 상태
**When** 클라이언트가 GET `/api/errors`를 요청하면
**Then** 저장된 모든 에러 목록이 반환되어야 한다

**API 사양:**
```http
POST /api/errors
Content-Type: application/json

{
  "id": "uuid",
  "timestamp": 1234567890,
  "noteId": "note-id",
  ...
}

Response:
Status: 201 Created
{
  "success": true,
  "id": "uuid"
}
```

#### AC-SRV-002: WebSocket 연결

**Given** 로컬 서버가 실행 중인 상태
**When** 클라이언트가 WebSocket에 연결하면
**Then** 연결이 성립되어야 한다

**Given** WebSocket이 연결된 상태
**When** 에러 메시지가 전송되면
**Then** 서버가 에러를 수신하고 저장해야 한다

**WebSocket 프로토콜:**
```javascript
// Client → Server
{
  "type": "error",
  "data": { ...ErrorCapture }
}

// Server → Client
{
  "type": "ack",
  "id": "error-id"
}
```

#### AC-SRV-003: 데이터베이스 지속성

**Given** 에러가 데이터베이스에 저장된 상태
**When** 서버가 재시작되면
**Then** 저장된 에러가 유지되어야 한다

**검증 방법:**
1. 서버 시작 및 에러 수신
2. 서버 정지
3. 서버 재시작
4. GET `/api/errors`로 에러 확인

---

### 2.3 자동 분석 (Auto Analysis)

#### AC-ANA-001: Claude Plan Mode 통합

**Given** 에러가 데이터베이스에 저장된 상태
**When** 분석이 요청되면
**Then** Claude API가 호출되어 에러를 분석해야 한다

**Given** Claude 분석이 완료된 상태
**When** 분석 결과가 반환되면
**Then** 다음 정보가 포함되어야 한다:
- 근본 원인 (rootCause)
- 영향 범위 (affectedScope)
- 수정 단계 (fixSteps)
- 심각도 (severity)
- 신뢰도 (confidence)

#### AC-ANA-002: 분석 결과 저장

**Given** Claude 분석이 완료된 상태
**When** 분석 결과가 수신되면
**Then** 결과가 데이터베이스에 저장되어야 한다

**Given** 분석 결과가 저장된 상태
**When** GET `/api/analysis/:id`를 요청하면
**Then** 저장된 분석 결과가 반환되어야 한다

#### AC-ANA-003: 분석 신뢰도

**Given** 에러 분석이 완료된 상태
**When** 분석 정확도를 측정하면
**Then** 80% 이상의 정확도를 가져야 한다

**검증 방법:**
- 100개의 테스트 에러 분석
- 각 분석 결과를 수동으로 검증
- 정확도 = (정확한 분석 수) / (전체 분석 수)

---

### 2.4 자동 수정 (Auto Fix)

#### AC-FIX-001: 수정 가능성 판단

**Given** 분석 결과가 생성된 상태
**When** 수정 가능성이 판단되면
**Then** 다음 기준으로 분류되어야 한다:
- 안전한 수정: 변수명 오타, 간단한 구문 오류
- 위험한 수정: 로직 변경, 데이터 구조 수정
- 수동 수정 필요: 복잡한 비즈니스 로직

**Given** 안전한 수정으로 판단된 상태
**When** 사용자에게 수정 옵션이 표시되면
**Then** 사용자가 확인 후 수정을 적용할 수 있어야 한다

#### AC-FIX-002: 백업 생성

**Given** 자동 수정이 실행되기 전 상태
**When** 수정이 적용되면
**Then** 원본 파일의 백업이 자동 생성되어야 한다

**Given** 백업이 생성된 상태
**When** 수정이 실패하거나 롤백이 필요하면
**Then** 백업에서 복원할 수 있어야 한다

**백업 정책:**
- 백업 경로: `.obsidian-error-log-backups/YYYYMMDD/`
- 백업 파일명: `{original-filename}.{timestamp}.bak`
- 보관 기간: 30일

#### AC-FIX-003: 수정 적용 및 검증

**Given** 사용자가 수정을 확인한 상태
**When** 수정이 적용되면
**Then** 다음 단계가 실행되어야 한다:
1. 대상 파일 백업
2. 수정 내용 적용
3. 문법 검증
4. 결과 기록

**Given** 수정이 적용된 상태
**When** 수정이 성공하면
**Then** 성공 메시지가 표시되어야 한다

**Given** 수정이 실패한 상태
**When** 에러가 발생하면
**Then** 롤백이 자동으로 실행되어야 한다

---

### 2.5 템플릿 시스템 (Template System)

#### AC-TMP-001: 기본 템플릿 제공

**Given** 시스템이 설치된 상태
**When** 템플릿 목록을 조회하면
**Then** 최소 5개의 기본 템플릿이 제공되어야 한다:
- 기본형 (Basic)
- API 호출형 (API Call)
- 플러그인형 (Plugin Specific)
- Promise/Async형 (Async Handler)
- 사용자 정의형 (Custom)

#### AC-TMP-002: 템플릿 변수 치환

**Given** 템플릿이 선택된 상태
**When** 템플릿이 노트에 삽입되면
**Then** 변수가 실제 값으로 치환되어야 한다

**지원 변수:**
- `{{SERVER_URL}}`: 로컬 서버 URL
- `{{NOTE_ID}}`: 현재 노트 ID
- `{{NOTE_PATH}}`: 현재 노트 경로
- `{{OBSIDIAN_VERSION}}`: Obsidian 버전
- `{{PLATFORM}}`: 실행 플랫폼

#### AC-TMP-003: 템플릿 커스터마이징

**Given** 사용자가 템플릿을 수정한 상태
**When** 커스텀 템플릿이 저장되면
**Then** 나중에 재사용할 수 있어야 한다

---

## 3. 비기능적 인수 기준 (Non-Functional Acceptance Criteria)

### 3.1 성능 (Performance)

#### AC-PER-001: 에러 캡처 지연시간

**Given** 에러가 발생한 상태
**When** 에러가 캡처되면
**Then** 100ms 이내에 캡처가 완료되어야 한다

**측정 방법:**
```javascript
const start = performance.now();
// Trigger error
const captureTime = performance.now() - start;
assert(captureTime < 100);
```

#### AC-PER-002: 서버 응답 시간

**Given** 에러가 전송된 상태
**When** 서버가 에러를 수신하면
**Then** 200ms 이내에 응답해야 한다 (P95)

**측정 방법:**
- 100개의 동시 요청 전송
- 95번째 백분위수 응답 시간 측정

#### AC-PER-003: 분석 완료 시간

**Given** 에러 분석이 요청된 상태
**When** Claude API가 분석을 완료하면
**Then** 30초 이내에 결과가 반환되어야 한다

### 3.2 보안 (Security)

#### AC-SEC-001: 로컬 통신 제한

**Given** 로컬 서버가 실행 중인 상태
**When** 외부 IP에서 접속을 시도하면
**Then** 연결이 거부되어야 한다

**검증 방법:**
```bash
# Localhost 접속 (성공)
curl http://localhost:4321/api/errors

# 외부 IP 접속 (실패)
curl http://192.168.1.100:4321/api/errors
# Expected: Connection refused
```

#### AC-SEC-002: 민감 정보 마스킹

**Given** 에러에 민감 정보가 포함된 상태
**When** 에러가 저장되면
**Then** 민감 정보가 마스킹되어야 한다

**마스킹 대상:**
- 비밀번호: `password: "***MASKED***"`
- API 키: `apiKey: "***MASKED***"`
- 토큰: `token: "***MASKED***"`
- 이메일: `***@***.***`

#### AC-SEC-003: 사용자 동의

**Given** 시스템이 처음 설치된 상태
**When** 사용자가 시스템을 시작하면
**Then** 동의 요청이 표시되어야 한다

**Given** 사용자가 동의하지 않은 상태
**When** 에러가 발생하면
**Then** 에러가 수집되지 않아야 한다

### 3.3 신뢰성 (Reliability)

#### AC-REL-001: 서버 가동 시간

**Given** 서버가 7일 연속 실행된 상태
**When** 가동 시간을 측정하면
**Then** 99% 이상의 가동률을 유지해야 한다

#### AC-REL-002: 데이터 손실 방지

**Given** 에러가 수신된 상태
**When** 서버가 비정상 종료되면
**Then** 에러 데이터가 손실되지 않아야 한다

**검증 방법:**
1. 에러 수신
2. 서버 프로세스 강제 종료 (`kill -9`)
3. 서버 재시작
4. 에러 데이터 확인

### 3.4 호환성 (Compatibility)

#### AC-COM-001: 플랫폼 지원

**Given** 시스템이 설치된 상태
**When** 다음 플랫폼에서 실행하면 정상 동작해야 한다:
- Windows 10+
- macOS 12+
- Linux (Ubuntu 20.04+)

#### AC-COM-002: Obsidian 버전 호환성

**Given** 에러 캐처가 설치된 상태
**When** Obsidian 1.5.0 이상에서 실행하면
**Then** 정상 동작해야 한다

---

## 4. 사용자 인수 테스트 (User Acceptance Testing)

### 4.1 UAT 시나리오

#### UAT-001: 기본 에러 수집

**사용자:** 일반 Obsidian 사용자
**목표:** 에러가 자동으로 수집되는지 확인

**단계:**
1. 로컬 서버 시작
2. Obsidian 노트 열기
3. 노트에 에러 캐처 템플릿 삽입
4. 의도적으로 에러 발생 (예: `undefinedVariable`)
5. 웹 대시보드에서 에러 확인
6. 분석 요청
7. 분석 결과 확인

**성공 기준:**
- 모든 단계가 오류 없이 완료
- 에러가 대시보드에 표시
- 분석 결과가 의미 있음

#### UAT-002: 자동 수정

**사용자:** 개발자
**목표:** 안전한 수정이 자동으로 적용되는지 확인

**단계:**
1. 오타가 포함된 코드 작성 (예: `console.lg("test")`)
2. 에러 발생 및 수집 대기
3. 분석 완료 대기
4. 수정 제안 확인
5. 수정 확인
6. 수정 적용
7. 코드 검증

**성공 기준:**
- 수정 제안이 정확함
- 수정이 안전하게 적용됨
- 백업이 생성됨
- 코드가 정상 작동함

#### UAT-003: 오프라인 복구

**사용자:** 모바일 사용자
**목표:** 오프라인 상태에서도 에러가 수집되는지 확인

**단계:**
1. 로컬 서버 중지
2. 노트에서 에러 발생
3. 로컬 서버 재시작
4. 에러가 서버에 전송되는지 확인

**성공 기준:**
- 오프라인 상태에서도 에러가 큐에 저장
- 서버 재시작 후 에러가 전송

---

## 5. 버그 보고 기준 (Bug Reporting Criteria)

### 5.1 Critical 버그

- 데이터 손실 발생
- 보안 취약점
- 시스템 충돌
- 자동 수정으로 데이터 파기

### 5.2 High 버그

- 에러 누락 (감지율 < 95%)
- 분석 실패 (정확도 < 80%)
- 성능 저하 (응답 시간 > 1초)

### 5.3 Medium 버그

- UI 표시 오류
- 일부 기능 작동 불능
- 호환성 문제

### 5.4 Low 버그

- 문맥 오류
- 미미한 UI 문제
- 로깅 개선 필요

---

## 6. 인수 테스트 체크리스트 (Acceptance Test Checklist)

### 6.1 기능 테스트

- [ ] 글로벌 에러 핸들링 동작
- [ ] 에러 메타데이터 수집
- [ ] 오프라인 큐잉 동작
- [ ] HTTP API 엔드포인트 동작
- [ ] WebSocket 연결 동작
- [ ] 데이터베이스 지속성 확인
- [ ] Claude 분석 통합 동작
- [ ] 분석 결과 저장 동작
- [ ] 수정 가능성 판단 동작
- [ ] 백업 생성 동작
- [ ] 수정 적용 및 검증 동작
- [ ] 템플릿 시스템 동작
- [ ] 템플릿 변수 치환 동작

### 6.2 성능 테스트

- [ ] 에러 캡처 지연시간 < 100ms
- [ ] 서버 응답 시간 < 200ms (P95)
- [ ] 분석 완료 시간 < 30초
- [ ] 메모리 사용량 < 100MB
- [ ] 디스크 사용량 < 10MB/일

### 6.3 보안 테스트

- [ ] 로컬 통신 제한 확인
- [ ] 민감 정보 마스킹 확인
- [ ] 사용자 동의 시스템 동작
- [ ] 외부 접속 차단 확인

### 6.4 신뢰성 테스트

- [ ] 7일 연속 가동 테스트
- [ ] 데이터 손실 방지 확인
- [ ] 비정상 종료 복구 확인

### 6.5 호환성 테스트

- [ ] Windows 10+ 동작 확인
- [ ] macOS 12+ 동작 확인
- [ ] Linux 동작 확인
- [ ] Obsidian 1.5.0+ 동작 확인

---

## 7. 인수 서명 (Acceptance Sign-Off)

### 7.1 승인자

| 역할 | 이름 | 서명 | 날짜 |
|------|------|------|------|
| Product Owner | - | - | - |
| Technical Lead | - | - | - |
| QA Lead | - | - | - |
| Security Reviewer | - | - | - |

### 7.2 승인 기준

- [ ] 모든 인수 기준 충족
- [ ] Critical/High 버그 해결
- [ ] 보안 검증 통과
- [ ] 성능 기준 충족
- [ ] 문서화 완료
- [ ] 사용자 매뉴얼 완료

---

## 8. 변경 이력 (Change History)

| 버전 | 날짜 | 변경 사항 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2026-02-04 | 초기 인수 기준 작성 | MoAI |
