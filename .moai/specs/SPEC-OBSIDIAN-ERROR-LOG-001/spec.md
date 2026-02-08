# SPEC-OBSIDIAN-ERROR-LOG-001

## SPEC 메타데이터

| 필드 | 값 |
|------|-----|
| **SPEC ID** | SPEC-OBSIDIAN-ERROR-LOG-001 |
| **제목** | Obsidian 에러 로깅 및 자동 분석 시스템 |
| **생성일** | 2026-02-04 |
| **상태** | Planned |
| **우선순위** | High |
| **담당자** | tbd |
| **라이프사이클** | spec-anchored |

---

## 1. 배경 (Background)

### 1.1 현재 문제 상황

이기종 디바이스(데스크톱, 모바일, 태블릿)에서 Obsidian 노트를 사용할 때 발생하는 콘솔 에러를 탐색하고 처리하는 데 한계가 있습니다.

**구체적 문제점:**

- **모바일/태블릿 환경**: 브라우저 개발자 도구 접근이 제한적임
- **에러 추적 어려움**: 디바이스 간 에러 로그 공유가 불가능
- **수동 분석 필요**: 에러 발생 시 수동으로 로그 확인 및 분석 필요
- **재현 어려움**: 인과관계 파악을 위한 문맥 정보 부족

### 1.2 제안된 해결책

MSA(Microservices Architecture) 사이드카 패턴을 적용한 자동화된 에러 처리 파이프라인 구축:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Obsidian Notes Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Note A     │  │   Note B     │  │   Note C     │          │
│  │ Error Catcher│  │ Error Catcher│  │ Error Catcher│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ HTTP/WebSocket
┌─────────────────────────────┼─────────────────────────────────────┐
│                  Sidecar Layer (Local Server)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Error Collector│ │Auto Analyzer│  │ Auto Fixer  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ Claude API
┌─────────────────────────────┼─────────────────────────────────────┐
│                    Claude Integration Layer                      │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ Plan Mode    │  │ Run Mode     │                              │
│  │ Analysis     │  │ Auto Fix     │                              │
│  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 핵심 아키텍처 원칙

**사이드카 패턴 (Sidecar Pattern):**

- **주 애플리케이션**: Obsidian 노트 (비즈니스 로직)
- **사이드카**: 로컬 에러 처리 서버 (횡단 관심사)
- **통신**: HTTP/WebSocket 기반 느슨한 결합
- **독립성**: 사이드카는 독립적으로 배포/업데이트 가능

---

## 2. 환경 (Environment)

### 2.1 기술 스택

| 계층 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **Obsidian Client** | JavaScript | ES2022+ | 에러 캐처 스크립트 |
| **Desktop Runtime** | Electron | Latest | 데스크톱 실행 환경 |
| **Mobile Runtime** | Capacitor | Latest | 모바일 실행 환경 |
| **Local Server** | Node.js | 20+ LTS | 로컬 서버 |
| **Web Framework** | Express | 4.19+ | HTTP 서버 |
| **Real-time Comm.** | WebSocket | 1.0+ | 실시간 에러 전송 |
| **AI Integration** | Claude API | 2025+ | 에러 분석/수정 |
| **Template Engine** | Handlebars | 4.0+ | 에러 캐처 템플릿 |

### 2.2 실행 환경

- **운영체제**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- **Obsidian 버전**: 1.5.0+
- **Node.js 버전**: 20.10.0 LTS 이상
- **네트워크**: localhost (127.0.0.1) 통신만 허용

### 2.3 의존성 제약사항

- **로컬 전용**: 외부 네트워크 연결 없이 로컬에서만 실행
- **오프라인 지원**: 인터넷 연결 없이 기본 로깅 기능 동작
- **보안**: 모든 통신은 localhost로 제한

---

## 3. 가정 (Assumptions)

### 3.1 기술적 가정

| 가정 | 신뢰도 | 근거 | 위험도 |
|------|--------|------|--------|
| Obsidian 플러그인이 JavaScript 실행을 허용함 | 높음 | Obsidian 플러그인 아키텍처 문서 | 낮음 |
| 로컬 서버가 백그라운드에서 계속 실행 가능함 | 높음 | Node.js 백그라운드 실행 지원 | 낮음 |
| 모바일 환경에서 localhost 통신이 가능함 | 중간 | Capacitor/Android 제약 사항 | 중간 |
| Claude API가 로컬 서버에서 호출 가능함 | 높음 | API 키 기반 인증 지원 | 낮음 |

### 3.2 비즈니스 가정

| 가정 | 신뢰도 | 근거 | 위험도 |
|------|--------|------|--------|
| 사용자가 에러 로그 수집에 동의할 것임 | 중간 | 프라이버시 정책 준수 필요 | 중간 |
| 자동 수정 기능이 사용자 생산성을 향상시킴 | 높음 | 수동 분석 시간 감소 | 낮음 |
| 템플릿 시스템이 에러 캐처 도입을 촉진할 것임 | 중간 | 사용자 편의성 개선 | 중간 |

### 3.3 검증 방법

- **기술적 검증**: PoC(Proof of Concept) 개발 후 각 환경에서 테스트
- **비즈니스 검증**: 베타 사용자 테스트 및 피드백 수집

---

## 4. 요구사항 (Requirements - EARS Format)

### 4.1 보편적 요구사항 (Ubiquitous Requirements)

**REQ-U-001: 로깅 시스템 가용성**
시스템은 **항상** 에러 로그 수집 서비스를 제공해야 한다.

**REQ-U-002: 데이터 프라이버시**
시스템은 **항상** 에러 데이터를 로컬에만 저장하고 외부로 전송하지 않아야 한다.

**REQ-U-003: 보안 통신**
시스템은 **항상** localhost 간 통신에서만 데이터를 전송해야 한다.

**REQ-U-004: 사용자 동의**
시스템은 **항상** 에러 수집 전 사용자 동의를 얻어야 한다.

### 4.2 이벤트 기반 요구사항 (Event-Driven Requirements)

**REQ-E-001: 에러 발생 감지**
**WHEN** Obsidian 노트에서 JavaScript 에러가 발생할 때, **THE** 시스템 **SHALL** 에러 정보를 캡처해야 한다.

**REQ-E-002: 에러 로그 전송**
**WHEN** 에러가 캡처되고 로컬 서버가 reachable 상태일 때, **THE** 시스템 **SHALL** 즉시 에러 데이터를 전송해야 한다.

**REQ-E-003: 에러 분석 자동화**
**WHEN** 로컬 서버가 에러를 수신할 때, **THE** 시스템 **SHALL** Claude Plan 모드를 사용하여 에러를 분석해야 한다.

**REQ-E-004: 자동 수정 실행**
**WHEN** 에러 분석이 완료되고 수정 방안이 도출될 때, **THE** 시스템 **SHALL** 사용자 확인 후 자동 수정을 실행해야 한다.

**REQ-E-005: 오프라인 큐잉**
**WHEN** 로컬 서버가 unreachable 상태일 때, **THE** 시스템 **SHALL** 에러를 로컬 큐에 저장하고 서버 재접속 시 일괄 전송해야 한다.

### 4.3 상태 기반 요구사항 (State-Driven Requirements)

**REQ-S-001: 서버 상태 모니터링**
**IF** 로컬 서버가 실행 중인 상태일 때, **THE** 시스템 **SHALL** 실시간 에러 전송을 활성화해야 한다.

**REQ-S-002: 오프라인 모드**
**IF** 로컬 서버가 실행 중이지 않은 상태일 때, **THE** 시스템 **SHALL** 로컬 스토리지에 에러를 보존해야 한다.

**REQ-S-003: 자동 수정 가능 여부 판단**
**IF** 에러 분석 결과 안전한 수정이 가능하다고 판단될 때, **THE** 시스템 **SHALL** 자동 수정 옵션을 제공해야 한다.

**REQ-S-004: 민감 정보 포함 여부**
**IF** 에러 데이터에 민감 정보(비밀번호, 토큰 등)가 포함될 때, **THE** 시스템 **SHALL** 데이터를 마스킹 처리해야 한다.

### 4.4 바람직한 요구사항 (Optional Requirements)

**REQ-O-001: 에러 캐처 템플릿**
**가능하면** 시스템은 다양한 에러 유형에 맞는 에러 캐처 템플릿을 제공해야 한다.

**REQ-O-002: 에러 대시보드**
**가능하면** 시스템은 웹 기반 에러 대시보드를 제공해야 한다.

**REQ-O-003: 에러 통계**
**가능하면** 시스템은 에러 발생 통계 및 추이 분석 기능을 제공해야 한다.

**REQ-O-004: 플러그인 통합**
**가능하면** 시스템은 기존 Obsidian 플러그인과 통합할 수 있어야 한다.

### 4.5 바람직하지 않은 요구사항 (Unwanted Requirements)

**REQ-UW-001: 외부 데이터 전송 금지**
시스템은 **절대로** 에러 데이터를 외부 서버로 전송하면 안 된다.

**REQ-UW-002: 사용자 데이터 파기 금지**
시스템은 **절대로** 사용자 동의 없이 에러 데이터를 삭제하면 안 된다.

**REQ-UW-003: Obsidian 원본 코드 수정 금지**
시스템은 **절대로** Obsidian 코어 코드를 직접 수정하면 안 된다.

**REQ-UW-004: 무조건적 자동 수정 금지**
시스템은 **절대로** 사용자 확인 없이 코드를 자동 수정하면 안 된다.

---

## 5. 상세 기능 명세 (Specifications)

### 5.1 에러 캐처 (Error Catcher)

**목적**: Obsidian 노트에서 발생하는 JavaScript 에러를 감지하고 수집

**기능 명세:**

1. **글로벌 에러 핸들러**
   - `window.onerror` 이벤트 리스너 등록
   - `unhandledrejection` 이벤트 리스너 등록 (Promise reject)

2. **에러 정보 수집**
   - 에러 메시지
   - 스택 트레이스
   - 발생 시간 (timestamp)
   - 노트 메타데이터 (노트 이름, 경로)

3. **에러 분류**
   - Syntax Error
   - Reference Error
   - Type Error
   - Network Error
   - Plugin Error

4. **전송 메커니즘**
   - WebSocket을 통한 실시간 전송 (우선)
   - HTTP POST를 통한 전송 (fallback)

**데이터 구조:**
```typescript
interface ErrorCapture {
  id: string;                    // UUID
  timestamp: number;             // Unix timestamp
  noteId: string;                // 노트 고유 ID
  notePath: string;              // 노트 파일 경로
  errorType: string;             // 에러 유형
  message: string;               // 에러 메시지
  stackTrace: string;            // 스택 트레이스
  context: {                     // 실행 컨텍스트
    userAgent: string;           // 브라우저/환경 정보
    obsidianVersion: string;     // Obsidian 버전
    platform: string;            // desktop/mobile/tablet
  };
}
```

### 5.2 로컬 서버 (Local Server)

**목적**: 에러 데이터를 수신, 저장, 분석하는 중앙 집중식 서버

**기능 명세:**

1. **HTTP 서버 (Express)**
   - POST `/api/errors`: 에러 수신 엔드포인트
   - GET `/api/errors`: 에러 목록 조회
   - GET `/api/errors/:id`: 특정 에러 조회
   - DELETE `/api/errors/:id`: 에러 삭제

2. **WebSocket 서버 (ws)**
   - 실시간 에러 스트리밍
   - 클라이언트 연결 관리
   - 재연결 자동 처리

3. **에러 저장소**
   - SQLite 데이터베이스 (로컬 파일 기반)
   - 에러 메타데이터 인덱싱
   - 암호화된 저장 (선택)

4. **Claude 통합 모듈**
   - Claude API 클라이언트
   - Plan Mode: 에러 분석
   - Run Mode: 수정 제안 생성

**데이터베이스 스키마:**
```sql
CREATE TABLE errors (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  note_id TEXT NOT NULL,
  note_path TEXT NOT NULL,
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  context TEXT,  -- JSON
  analysis_result TEXT,  -- JSON
  fix_applied BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timestamp ON errors(timestamp);
CREATE INDEX idx_note_id ON errors(note_id);
CREATE INDEX idx_error_type ON errors(error_type);
```

### 5.3 자동 분석 (Auto Analysis)

**목적**: Claude API를 사용한 에러 자동 분석

**기능 명세:**

1. **Plan Mode 분석**
   - 에러 원인 파악
   - 영향 범위 분석
   - 수정 방안 제안

2. **분류 규칙**
   - 심각도 (Severity): Critical, High, Medium, Low
   - 긴급도 (Urgency): Immediate, Soon, Later
   - 복잡도 (Complexity): Simple, Moderate, Complex

3. **Claude 프롬프트 템플릿**
```
다음 Obsidian 노트에서 발생한 에러를 분석해주세요:

에러 메시지: {message}
에러 유형: {errorType}
스택 트레이스: {stackTrace}
노트 경로: {notePath}

다음 항목을 포함한 분석 결과를 제공해주세요:
1. 에러 근본 원인
2. 영향받는 코드 범위
3. 수정 방안 (단계별)
4. 예방 조치
5. 심각도 평가 (Critical/High/Medium/Low)
```

**분석 결과 구조:**
```typescript
interface AnalysisResult {
  errorId: string;
  rootCause: string;              // 근본 원인
  affectedScope: string[];        // 영향 범위
  fixSteps: string[];             // 수정 단계
  preventionMeasures: string[];   // 예방 조치
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  urgency: 'Immediate' | 'Soon' | 'Later';
  complexity: 'Simple' | 'Moderate' | 'Complex';
  confidence: number;             // 0~1 신뢰도
  estimatedTime: string;          // 예상 소요 시간
}
```

### 5.4 자동 수정 (Auto Fix)

**목적**: 분석 결과를 바탕으로 안전한 자동 수정 실행

**기능 명세:**

1. **수정 가능성 판단**
   - 안전한 수정: 변수명 오타, 간단한 구문 오류
   - 위험한 수정: 로직 변경, 데이터 구조 수정
   - 수동 수정 필요: 복잡한 비즈니스 로직

2. **수정 전 확인**
   - 사용자에게 수정 내용 표시
   - 적용 전 diff 표시
   - 백업 자동 생성

3. **수정 실행**
   - 노트 파일 직접 수정
   - 수정 로그 기록
   - 롤백 기능 지원

**수정 프로세스:**
```
1. Claude 분석 완료
2. 수정 가능성 판단
3. 사용자 확인 요청
4. 백업 생성
5. 수정 적용
6. 검증 실행
7. 결과 기록
```

### 5.5 템플릿 시스템 (Template System)

**목적**: 재사용 가능한 에러 캐처 템플릿 제공

**기능 명세:**

1. **템플릿 유형**
   - 기본형: 전역 에러 핸들러
   - API 호출형: 네트워크 요청 에러 캡처
   - 플러그인형: 특정 플러그인 에러 캡처
   - 사용자 정의형: 사용자 커스텀 템플릿

2. **템플릿 삽입 방법**
   - Copy & Paste
   - Obsidian 플러그인 UI
   - 커맨드 팔레트 명령

3. **템플릿 변수**
   - `{{SERVER_URL}}`: 로컬 서버 URL
   - `{{NOTE_ID}}`: 현재 노트 ID
   - `{{NOTE_PATH}}`: 현재 노트 경로

**기본 템플릿 예시:**
```javascript
// Obsidian Error Catcher Template
// 설치: 노트의 <head> 또는 <body> 태그 내에 삽입

(function() {
  const SERVER_URL = '{{SERVER_URL}}'; // 기본: http://localhost:4321

  // 에러 캡처 함수
  function captureError(error, context) {
    const errorData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      noteId: '{{NOTE_ID}}',
      notePath: '{{NOTE_PATH}}',
      errorType: error.name || 'Unknown',
      message: error.message || String(error),
      stackTrace: error.stack || '',
      context: {
        userAgent: navigator.userAgent,
        obsidianVersion: '{{OBSIDIAN_VERSION}}',
        platform: '{{PLATFORM}}'
      }
    };

    // WebSocket으로 전송 (실패 시 HTTP fallback)
    sendError(errorData);
  }

  // WebSocket 전송
  function sendError(errorData) {
    const ws = new WebSocket(`ws://${SERVER_URL.replace('http://', 'ws://')}`);

    ws.onopen = () => {
      ws.send(JSON.stringify(errorData));
      ws.close();
    };

    ws.onerror = () => {
      // Fallback to HTTP
      fetch(`http://${SERVER_URL}/api/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      }).catch(console.error);
    };
  }

  // 글로벌 에러 핸들러 등록
  window.onerror = (message, source, lineno, colno, error) => {
    captureError(error || new Error(message), { source, lineno, colno });
  };

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, { type: 'unhandledrejection' });
  });

  console.log('[Obsidian Error Catcher] Initialized');
})();
```

---

## 6. 아키텍처 설계 (Architecture Design)

### 6.1 사이드카 패턴 적용

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Application                         │
│                        (Obsidian Notes)                         │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Note A     │  │   Note B     │  │   Note C     │          │
│  │              │  │              │  │              │          │
│  │ [코드 실행]   │  │ [코드 실행]   │  │ [코드 실행]   │          │
│  │     │        │  │     │        │  │     │        │          │
│  │     ▼        │  │     ▼        │  │     ▼        │          │
│  │ Error Catcher│  │ Error Catcher│  │ Error Catcher│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          │ HTTP/WebSocket   │                  │
          └──────────────────┼──────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Sidecar Service                          │
│                     (Local Error Server)                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  HTTP API    │  │  WebSocket   │  │  Claude      │          │
│  │  Endpoint    │  │  Server      │  │  Integration │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            ▼                                     │
│                   ┌──────────────┐                               │
│                   │  SQLite DB   │                               │
│                   │  (Local)     │                               │
│                   └──────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 통신 프로토콜

**WebSocket (실시간):**
- 포트: 4321 (기본, 설정 가능)
- 프로토콜: `ws://localhost:4321/ws`
- 메시지 형식: JSON

**HTTP (REST API):**
- 베이스 URL: `http://localhost:4321`
- POST `/api/errors`: 에러 수신
- GET `/api/errors`: 에러 목록 조회
- GET `/api/analysis/:id`: 분석 결과 조회
- POST `/api/fix/:id`: 수정 실행

### 6.3 데이터 흐름

```
1. 에러 발생
   └─> Error Catcher 감지

2. 에러 캡처
   ├─> 에러 메타데이터 추출
   ├─> 스택 트레이스 수집
   └─> 컨텍스트 정보 수집

3. 전송
   ├─> WebSocket 실시간 전송 (우선)
   └─> HTTP POST fallback

4. 수신 및 저장
   ├─> Local Server 수신
   ├─> SQLite DB 저장
   └─> 수신 확인 응답

5. 자동 분석 (Claude Plan Mode)
   ├─> 에러 데이터 Claude에 전송
   ├─> 원인 및 수정 방안 분석
   └─> 분석 결과 저장

6. 자동 수정 (사용자 확인 후)
   ├─> 수정 방안 표시
   ├─> 사용자 확인
   ├─> 백업 생성
   ├─> 수정 적용
   └─> 결과 기록
```

---

## 7. 보안 고려사항 (Security Considerations)

### 7.1 로컬 통신 제한

- **localhost만 허용**: 127.0.0.1 및 ::1만 접속 허용
- **포트 노출 방지**: 방화벽 설정으로 외부 접속 차단
- **CORS 비활성화**: 로컬에서만 허용

### 7.2 데이터 마스킹

**민감 정보 패턴:**
- 비밀번호: `/password\s*[:=]\s*["']?[\w]+["']?/gi`
- API 키: `/api[_-]?key\s*[:=]\s*["']?[\w-]+["']?/gi`
- 토큰: `/token\s*[:=]\s*["']?[\w.-]+["']?/gi`
- 이메일: `/[\w.-]+@[\w.-]+\.\w+/g`

**마스킹 처리:**
```javascript
function maskSensitiveData(data) {
  return data
    .replace(/password\s*[:=]\s*["']?[\w]+["']?/gi, 'password: "***MASKED***"')
    .replace(/api[_-]?key\s*[:=]\s*["']?[\w-]+["']?/gi, 'apiKey: "***MASKED***"')
    .replace(/token\s*[:=]\s*["']?[\w.-]+["']?/gi, 'token: "***MASKED***"')
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '***@***.***');
}
```

### 7.3 사용자 동의

- **초기 설정 시 동의 요청**
- **언제든 비활성화 가능**
- **수집된 데이터 삭제 기능**
- **투명한 프라이버시 정책**

---

## 8. 테스트 전략 (Testing Strategy)

### 8.1 단위 테스트

- **Error Catcher 모듈**: 에러 캡처 정확성 검증
- **API Endpoints**: 요청/응답 검증
- **데이터 마스킹**: 민감 정보 필터링 검증
- **Claude 통합**: Mock API로 분석 결과 검증

### 8.2 통합 테스트

- **End-to-End 플로우**: 에러 발생 → 수신 → 분석 → 수정
- **오프라인 복구**: 서버 다운 시 큐 동작 검증
- **멀티 디바이스**: 데스크톱/모바일 동시 접속 검증

### 8.3 사용자 테스트

- **베타 테스터 그룹**: 10~20명
- **테스트 기간**: 2주
- **피드백 수집**: UX, 버그, 개선사항

---

## 9. 성능 요구사항 (Performance Requirements)

| 항목 | 목표 | 측정 방법 |
|------|------|-----------|
| 에러 캡처 지연시간 | < 100ms | timestamp 비교 |
| 전송 지연시간 | < 500ms | 네트워크 타임스탬프 |
| 분석 완료 시간 | < 30초 | Claude API 응답 시간 |
| 서버 응답 시간 | < 200ms | HTTP 응답 헤더 |
| 메모리 사용량 | < 100MB | 프로세스 모니터링 |
| 디스크 사용량 | < 10MB/일 | DB 파일 크기 |

---

## 10. 추적성 (Traceability)

### 10.1 관련 문서

- **프로젝트 구조**: `.moai/project/structure.md`
- **기술 스택**: `.moai/project/tech.md`
- **구현 계획**: `plan.md` (본 SPEC)
- **인수 기준**: `acceptance.md` (본 SPEC)

### 10.2 의존 SPEC

- 없음 (독립적 기능)

### 10.3 추적 태그

```yaml
tags:
  - spec-obsidian-error-log
  - sidecar-pattern
  - error-handling
  - claude-integration
  - msa-architecture
```

---

## 11. 변경 이력 (Change History)

| 버전 | 날짜 | 변경 사항 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2026-02-04 | 초기 SPEC 작성 | MoAI |

---

## 12. 검토 (Review)

| 항목 | 상태 | 검토자 | 날짜 |
|------|------|--------|------|
| 요구사항 정의 | 완료 | - | - |
| 아키텍처 설계 | 완료 | - | - |
| 보안 검토 | 대기 | - | - |
| 성능 검토 | 대기 | - | - |
| 사용자 테스트 | 대기 | - | - |
