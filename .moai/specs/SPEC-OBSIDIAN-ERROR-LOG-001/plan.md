# SPEC-OBSIDIAN-ERROR-LOG-001: 구현 계획

## 추적성 (Traceability)

**SPEC ID**: SPEC-OBSIDIAN-ERROR-LOG-001
**관련 문서**: `spec.md`, `acceptance.md`

---

## 1. 구현 개요 (Implementation Overview)

### 1.1 목표

사이드카 패턴을 기반으로 한 Obsidian 에러 로깅 및 자동 분석 시스템 구축하여, 이기종 디바이스 환경에서의 에러 처리 자동화实现

### 1.2 핵심 성과 지표

- 에러 감지율: 95% 이상
- 자동 분석 정확도: 80% 이상
- 자동 수정 성공률: 70% 이상 (안전한 수정 대상)
- 사용자 만족도: 4.0/5.0 이상

---

## 2. 기술적 접근 방법 (Technical Approach)

### 2.1 아키텍처 스타일

**사이드카 패턴 (Sidecar Pattern):**
- 주 애플리케이션과 횡단 관심사 분리
- 느슨한 결합 through HTTP/WebSocket
- 독립적 배포 및 확장 가능

**계층 구조:**
```
Presentation Layer: Error Catcher Client
Application Layer: Error Processing Service
Domain Layer: Error Analysis & Fix Logic
Infrastructure Layer: SQLite, Claude API
```

### 2.2 기술 스택 결정 사유

| 기술 | 선택 이유 | 대안 |
|------|-----------|------|
| **Node.js 20+ LTS** | JavaScript 생태계 호환, 비동기 I/O | Python (AsyncIO), Go |
| **Express** | 미들웨어 생태계, 빠른 프로토타이핑 | Fastify, Koa |
| **WebSocket (ws)** | 양방향 실시간 통신 | Server-Sent Events, Polling |
| **SQLite** | 서버리스, 로컬 파일 기반, 간단한 설정 | PostgreSQL, MongoDB |
| **Claude API** | 높은 코드 분석 능력 | GPT-4, Local LLM |

### 2.3 통신 프로토콜 결정

**WebSocket (우선):**
- 장점: 실시간 양방향 통신, 낮은 지연시간
- 단점: 연결 유지 비용
- 용도: 에러 실시간 전송

**HTTP POST (Fallback):**
- 장점: 간단한 구현, 방화벽 친화적
- 단점: 요청마다 오버헤드
- 용도: WebSocket 실패 시 대체

---

## 3. 구현 마일스톤 (Implementation Milestones)

### 3.1 Phase 1: 기반 구조 (Primary Goal)

**목표**: 에러 캡처 및 수신 기본 기능 구현

**작업 항목:**
- [ ] 로컬 서버 프로젝트 초기 설정
- [ ] Express HTTP 서버 구현
- [ ] WebSocket 서버 구현
- [ ] SQLite 데이터베이스 스키마 설계
- [ ] 기본 에러 캐처 템플릿 작성
- [ ] 에러 수신 API 엔드포인트 구현

**완료 기준:**
- 에러 캡처 → 서버 전송 → DB 저장 플로우 동작
- 데스크톱 환경에서 기본 기능 검증

**의존성:** 없음

### 3.2 Phase 2: 분석 통합 (Secondary Goal)

**목표**: Claude API 연동 및 자동 분석 기능 구현

**작업 항목:**
- [ ] Claude API 클라이언트 모듈 구현
- [ ] Plan Mode 분석 프롬프트 설계
- [ ] 에러 분석 파이프라인 구현
- [ ] 분석 결과 저장 기능 구현
- [ ] 분석 대시보드 UI (초기 버전)

**완료 기준:**
- 에러 수신 시 자동 분석 실행
- 분석 결과가 JSON으로 저장됨
- 웹 UI에서 분석 결과 확인 가능

**의존성:** Phase 1 완료

### 3.3 Phase 3: 자동 수정 (Final Goal)

**목표**: 안전한 자동 수정 기능 구현

**작업 항목:**
- [ ] 수정 가능성 판단 로직 구현
- [ ] 사용자 확인 UI 구현
- [ ] 백업 시스템 구현
- [ ] 수정 실행 엔진 구현
- [ ] 롤백 기능 구현

**완료 기준:**
- 안전한 수정(변수명 오타 등)이 자동으로 적용됨
- 사용자 확인 후 수정됨
- 백업에서 롤백 가능

**의존성:** Phase 2 완료

### 3.4 Phase 4: 템플릿 시스템 (Optional Goal)

**목표:** 재사용 가능한 에러 캐처 템플릿 시스템 구현

**작업 항목:**
- [ ] 템플릿 엔진 구현 (Handlebars)
- [ ] 기본 템플릿 라이브러리 작성
- [ ] 템플릿 삽입 도구 구현
- [ ] 사용자 정의 템플릿 지원
- [ ] 템플릿 문서화

**완료 기준:**
- 5개 이상의 기본 템플릿 제공
- 사용자가 커스텀 템플릿 작성 가능
- 템플릿 가이드 문서 완성

**의존성:** Phase 1 완료

### 3.5 Phase 5: 모바일 지원 (Optional Goal)

**목표:** 모바일 환경에서의 에러 수집 지원

**작업 항목:**
- [ ] Capacitor 환경 테스트
- [ ] 모바일 네트워크 제약 처리
- [ ] 배터리 최적화
- [ ] 모바일 UI 최적화

**완료 기준:**
- iOS/Android에서 에러 수신 동작
- 배터리 소모 최소화

**의존성:** Phase 1 완료

---

## 4. 상세 구현 계획 (Detailed Implementation Plan)

### 4.1 디렉토리 구조

```
obsidian-error-log-system/
├── local-server/                 # 로컬 에러 서버
│   ├── src/
│   │   ├── server/
│   │   │   ├── http-server.ts    # Express HTTP 서버
│   │   │   ├── ws-server.ts      # WebSocket 서버
│   │   │   └── server.ts         # 메인 서버
│   │   ├── api/
│   │   │   ├── errors.ts         # 에러 API 라우터
│   │   │   ├── analysis.ts       # 분석 API 라우터
│   │   │   └── fix.ts            # 수정 API 라우터
│   │   ├── services/
│   │   │   ├── error-collector.ts # 에러 수집 서비스
│   │   │   ├── claude-service.ts  # Claude 통합 서비스
│   │   │   ├── analysis-service.ts # 분석 서비스
│   │   │   └── fix-service.ts     # 수정 서비스
│   │   ├── database/
│   │   │   ├── schema.sql         # DB 스키마
│   │   │   └── database.ts        # DB 연결
│   │   ├── security/
│   │   │   └── data-masking.ts    # 데이터 마스킹
│   │   └── index.ts
│   ├── templates/                 # 에러 캐처 템플릿
│   │   ├── basic.js
│   │   ├── api-call.js
│   │   └── plugin-specific.js
│   ├── web-ui/                    # 웹 대시보드
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── error-catcher/                 # 에러 캐처 라이브러리
│   ├── src/
│   │   ├── catcher.ts            # 메인 캐처 클래스
│   │   ├── transport.ts          # 전송 계층
│   │   ├── queue.ts              # 오프라인 큐
│   │   └── index.ts
│   ├── package.json
│   └── README.md
│
├── docs/                          # 문서
│   ├── architecture.md           # 아키텍처 문서
│   ├── api-reference.md          # API 레퍼런스
│   ├── template-guide.md         # 템플릿 가이드
│   └── user-guide.md             # 사용자 가이드
│
└── tests/                         # 테스트
    ├── unit/                     # 단위 테스트
    ├── integration/              # 통합 테스트
    └── e2e/                      # E2E 테스트
```

### 4.2 핵심 모듈 설계

#### 4.2.1 에러 캐처 (Error Catcher)

**파일:** `error-catcher/src/catcher.ts`

**핵심 클래스:**
```typescript
class ErrorCatcher {
  private config: CatcherConfig;
  private transport: Transport;
  private queue: ErrorQueue;

  constructor(config: CatcherConfig);
  capture(error: Error, context?: ErrorContext): void;
  captureGlobalErrors(): void;
  flush(): Promise<void>;
}
```

**주요 메서드:**
- `capture()`: 에러 캡처 및 전송
- `captureGlobalErrors()`: 글로벌 에러 핸들러 등록
- `flush()`: 오프라인 큐 비우기

#### 4.2.2 로컬 서버 (Local Server)

**파일:** `local-server/src/server/server.ts`

**핵심 클래스:**
```typescript
class ErrorServer {
  private httpServer: HttpServer;
  private wsServer: WsServer;
  private db: Database;

  constructor(config: ServerConfig);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  private setupRoutes(): void;
  private setupWebSocket(): void;
}
```

**주요 메서드:**
- `start()`: 서버 시작
- `stop()`: 서버 정지
- `setupRoutes()`: HTTP 라우트 설정
- `setupWebSocket()`: WebSocket 핸들러 설정

#### 4.2.3 Claude 서비스 (Claude Service)

**파일:** `local-server/src/services/claude-service.ts`

**핵심 클래스:**
```typescript
class ClaudeService {
  private apiKey: string;
  private apiEndpoint: string;

  constructor(config: ClaudeConfig);
  async analyzeError(error: ErrorCapture): Promise<AnalysisResult>;
  async generateFix(analysis: AnalysisResult): Promise<FixSuggestion>;
  private buildPrompt(error: ErrorCapture): string;
}
```

**주요 메서드:**
- `analyzeError()`: 에러 분석 요청
- `generateFix()`: 수정 제안 생성
- `buildPrompt()`: Claude 프롬프트 작성

### 4.3 API 엔드포인트 설계

| 엔드포인트 | 메서드 | 설명 | 요청 본문 | 응답 |
|-----------|--------|------|-----------|------|
| `/api/errors` | POST | 에러 수신 | `ErrorCapture` | `{ success: boolean, id: string }` |
| `/api/errors` | GET | 에러 목록 조회 | - | `ErrorCapture[]` |
| `/api/errors/:id` | GET | 특정 에러 조회 | - | `ErrorCapture` |
| `/api/errors/:id` | DELETE | 에러 삭제 | - | `{ success: boolean }` |
| `/api/analysis/:id` | GET | 분석 결과 조회 | - | `AnalysisResult` |
| `/api/analysis/:id` | POST | 분석 요청 | - | `{ taskId: string }` |
| `/api/fix/:id` | POST | 수정 실행 | `{ confirmed: boolean }` | `{ success: boolean, backupPath: string }` |
| `/ws` | WebSocket | 실시간 에러 스트림 | - | `ErrorCapture` |

---

## 5. 데이터 모델 (Data Models)

### 5.1 에러 캡처 (ErrorCapture)

```typescript
interface ErrorCapture {
  id: string;                    // UUID v4
  timestamp: number;             // Unix timestamp (ms)
  noteId: string;                // 노트 고유 ID
  notePath: string;              // 노트 파일 경로
  errorType: ErrorType;          // 에러 유형
  message: string;               // 에러 메시지
  stackTrace?: string;           // 스택 트레이스
  context: ErrorContext;         // 실행 컨텍스트
}

type ErrorType =
  | 'SyntaxError'
  | 'ReferenceError'
  | 'TypeError'
  | 'NetworkError'
  | 'PluginError'
  | 'Unknown';

interface ErrorContext {
  userAgent: string;             // 브라우저/환경 정보
  obsidianVersion: string;       // Obsidian 버전
  platform: 'desktop' | 'mobile' | 'tablet';
  additionalData?: Record<string, any>;
}
```

### 5.2 분석 결과 (AnalysisResult)

```typescript
interface AnalysisResult {
  errorId: string;               // 참조 에러 ID
  rootCause: string;             // 근본 원인
  affectedScope: string[];       // 영향 범위
  fixSteps: FixStep[];           // 수정 단계
  preventionMeasures: string[];  // 예방 조치
  severity: Severity;            // 심각도
  urgency: Urgency;              // 긴급도
  complexity: Complexity;        // 복잡도
  confidence: number;            // 신뢰도 (0~1)
  estimatedTime: string;         // 예상 소요 시간
  createdAt: number;             // 분석 생성 시간
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type Urgency = 'Immediate' | 'Soon' | 'Later';
type Complexity = 'Simple' | 'Moderate' | 'Complex';

interface FixStep {
  step: number;                  // 단계 번호
  description: string;           // 설명
  code?: string;                 // 코드 예시
  filePath?: string;             // 대상 파일 경로
  line?: number;                 // 라인 번호
}
```

### 5.3 수정 제안 (FixSuggestion)

```typescript
interface FixSuggestion {
  analysisId: string;            // 참조 분석 ID
  safeToApply: boolean;          // 자동 적용 가능 여부
  changes: FileChange[];         // 파일 변경 사항
  backupPath: string;            // 백업 경로
  rollbackInstructions: string;  // 롤백 지침
  estimatedTime: string;         // 예상 소요 시간
}

interface FileChange {
  filePath: string;              // 파일 경로
  oldContent: string;            // 기존 내용
  newContent: string;            // 새 내용
  lineStart: number;             // 시작 라인
  lineEnd: number;               // 끝 라인
}
```

---

## 6. 위험 및 대응 계획 (Risk and Mitigation)

### 6.1 기술적 위험

| 위험 | 영향 | 확률 | 대응 계획 |
|------|------|------|-----------|
| 모바일 환경에서 WebSocket 연결 불안정 | 높음 | 중간 | HTTP 폴링 fallback 구현 |
| Claude API 속도 제한으로 분석 지연 | 중간 | 낮음 | 요청 큐 및 재시도 로직 |
| SQLite DB 파일 손상 | 높음 | 낮음 | 정기 백업, 복구 프로시저 |
| 에러 캐처가 Obsidian 성능 저하 | 중간 | 중간 | 비동기 처리, 샘플링 |

### 6.2 운영적 위험

| 위험 | 영향 | 확률 | 대응 계획 |
|------|------|------|-----------|
| 사용자가 로컬 서버 실행을 잊음 | 높음 | 높음 | 시스템 트레이 아이콘, 자동 시작 |
| 사용자 동의 없이 데이터 수집 우려 | 높음 | 중간 | 명확한 프라이버시 정책, 옵트인 |
| 잘못된 자동 수정으로 데이터 손실 | 높음 | 낮음 | 백업 강제, 롤백 기능 |

### 6.3 대응 우선순위

1. **높음/높음**: 사용자 동의 시스템 → 즉시 구현
2. **높음/중간**: 모바일 WebSocket 안정화 → Phase 5
3. **높음/낮음**: 자동 수정 안전장치 → Phase 3
4. **중간/중간**: 에러 캐처 성능 최적화 → Phase 1

---

## 7. 테스트 전략 (Testing Strategy)

### 7.1 단위 테스트 (Unit Tests)

**커버리지 목표:** 85% 이상

**테스트 대상:**
- `ErrorCatcher` 클래스
- `Transport` 모듈
- `ErrorQueue` 모듈
- `ClaudeService` 클래스 (Mock 사용)
- 데이터 마스킹 유틸리티

**도구:** Jest, Supertest

### 7.2 통합 테스트 (Integration Tests)

**테스트 시나리오:**
1. 에러 캡처 → 서버 전송 → DB 저장
2. 오프라인 큐 → 서버 재접속 → 일괄 전송
3. 에러 수신 → Claude 분석 → 결과 저장
4. 분석 결과 → 사용자 확인 → 수정 적용

**도구:** Docker Compose (테스트 환경), Testcontainers

### 7.3 E2E 테스트 (End-to-End Tests)

**테스트 시나리오:**
1. Obsidian 노트에서 에러 발생
2. 에러 캡처 동작
3. 로컬 서버 수신
4. 자동 분석 실행
5. 자동 수정 적용

**도구:** Playwright, Puppeteer

---

## 8. 배포 전략 (Deployment Strategy)

### 8.1 릴리스 단계

**Alpha Release (내부 테스트):**
- 대상: 개발팀
- 기간: 1주
- 목표: 주요 기능 동작 검증

**Beta Release (베타 테스터):**
- 대상: 10~20명 선발 사용자
- 기간: 2주
- 목표: 실제 환경 버그 발견

**RC Release (후보 릴리스):**
- 대상: 모든 관심자
- 기간: 1주
- 목표: 최종 버그 수정

** Stable Release (정식 릴리스):**
- 대상: 일반 사용자
- 배포: GitHub Releases,npm

### 8.2 설치 방법

**npm (추천):**
```bash
npm install -g obsidian-error-log-server
obsidian-error-log-server start
```

**직접 실행:**
```bash
git clone https://github.com/user/obsidian-error-log-system.git
cd obsidian-error-log-system/local-server
npm install
npm start
```

---

## 9. 유지보수 계획 (Maintenance Plan)

### 9.1 정기 작업

- **주간**: 에러 로그 정리 (30일 이상 된 로그 아카이빙)
- **월간**: Claude API 프롬프트 최적화 검토
- **분기**: 보안 업데이트 및 의존성 업데이트

### 9.2 모니터링 항목

- 서버 가동 시간
- 에러 수신량
- 분석 성공률
- 수정 적용률
- 사용자 피드백

---

## 10. 추적성 매트릭스 (Traceability Matrix)

| 요구사항 ID | 구현 Phase | 컴포넌트 | 테스트 케이스 |
|-------------|------------|----------|---------------|
| REQ-U-001 | Phase 1 | Error Server | TC-SRV-001 |
| REQ-U-002 | Phase 1 | Data Masking | TC-SEC-001 |
| REQ-U-003 | Phase 1 | Server Config | TC-SEC-002 |
| REQ-U-004 | Phase 1 | Consent UI | TC-UX-001 |
| REQ-E-001 | Phase 1 | Error Catcher | TC-CAT-001 |
| REQ-E-002 | Phase 1 | Transport | TC-TRN-001 |
| REQ-E-003 | Phase 2 | Claude Service | TC-ANA-001 |
| REQ-E-004 | Phase 3 | Fix Service | TC-FIX-001 |
| REQ-E-005 | Phase 1 | Error Queue | TC-QUE-001 |
| REQ-S-001 | Phase 1 | Transport | TC-TRN-002 |
| REQ-S-002 | Phase 1 | Error Queue | TC-QUE-002 |
| REQ-S-003 | Phase 3 | Fix Service | TC-FIX-002 |
| REQ-S-004 | Phase 1 | Data Masking | TC-SEC-003 |
| REQ-O-001 | Phase 4 | Template Engine | TC-TMP-001 |
| REQ-O-002 | Phase 2 | Web Dashboard | TC-UI-001 |
| REQ-O-003 | Phase 2 | Analytics | TC-ANA-002 |
| REQ-O-004 | Phase 2 | Plugin Adapter | TC-PLG-001 |
| REQ-UW-001 | Phase 1 | Server Config | TC-SEC-004 |
| REQ-UW-002 | Phase 1 | DB Service | TC-DB-001 |
| REQ-UW-003 | Phase 1 | Error Catcher | TC-CAT-002 |
| REQ-UW-004 | Phase 3 | Fix Service | TC-FIX-003 |

---

## 11. 변경 이력 (Change History)

| 버전 | 날짜 | 변경 사항 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2026-02-04 | 초기 구현 계획 작성 | MoAI |
