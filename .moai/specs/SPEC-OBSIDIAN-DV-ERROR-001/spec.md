# SPEC-OBSIDIAN-DV-ERROR-001

## SPEC 메타데이터

| 필드 | 값 |
|------|-----|
| **SPEC ID** | SPEC-OBSIDIAN-DV-ERROR-001 |
| **제목** | Obsidian Dataviewjs 에러 로깅 시스템 |
| **생성일** | 2026-02-04 |
| **상태** | Planned |
| **우선순위** | High |
| **담당자** | tbd |
| **라이프사이클** | spec-anchored |
| **관련 SPEC** | SPEC-OBSIDIAN-ERROR-LOG-001 (기존 구현) |

---

## 1. 배경 (Background)

### 1.1 현재 문제 상황

기존 Obsidian 에러 로깅 시스템(SPEC-OBSIDIAN-ERROR-LOG-001)은 DevTools Console에 수동으로 스크립트를 주입하는 방식을 사용합니다. 이 접근법은 다음과 같은 제약사항이 있습니다:

**구체적 문제점:**

- **모바일/태블릿 제한**: Obsidian Mobile에서 DevTools Console 접근이 불가능함
- **노트별 설정 필요**: 각 노트마다 개별적으로 에러 캐처 설정 필요
- **설정 복잡성**: 사용자가 noteId, notePath 등을 수동으로 입력해야 함
- **유지보수 어려움**: 서버 URL 변경 시 모든 노트를 수정해야 함

### 1.2 제안된 해결책

Dataviewjs 플러그인을 활용한 템플릿 기반 에러 캡처 시스템:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Obsidian Notes Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Note A     │  │   Note B     │  │   Note C     │          │
│  │ ```dataviewjs│  │ ```dataviewjs│  │ ```dataviewjs│          │
│  │ dv.view(...) │  │ dv.view(...) │  │ dv.view(...) │          │
│  │ ```          │  │ ```          │  │ ```          │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ HTTP/WebSocket
┌─────────────────────────────┼─────────────────────────────────────┐
│                  Dataviewjs Template Layer                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /error-catcher.js (공통 템플릿)                         │   │
│  │  - 자동 노트 메타데이터 감지                             │   │
│  │  - 중앙 설정 관리 (플러그인 데이터)                      │   │
│  │  - 글로벌 에러 핸들러 등록                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┼─────────────────────────────────────┘
                             │
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
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 핵심 아키텍처 원칙

**템플릿 패턴 (Template Pattern):**

- **공통 템플릿**: 단일 error-catcher.js 파일로 모든 노트에서 재사용
- **자동 감지**: Dataviewjs API를 활용한 노트 메타데이터 자동 추출
- **중앙 설정**: Obsidian 플러그인 데이터 폴더에 설정 저장
- **단일 라인 사용성**: `dv.view('/error-catcher')` 한 줄로 활성화

---

## 2. 환경 (Environment)

### 2.1 기술 스택

| 계층 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **Obsidian Client** | Dataview Plugin | 0.5.67+ | 템플릿 엔진 |
| **Template Runtime** | Dataviewjs API | ES2022+ | 노트 메타데이터 접근 |
| **Error Capture** | JavaScript | ES2022+ | 에러 핸들러 |
| **Desktop Runtime** | Electron | Latest | 데스크톱 실행 환경 |
| **Mobile Runtime** | Capacitor | Latest | 모바일 실행 환경 |
| **Local Server** | Node.js | 20+ LTS | 로컬 서버 (기존) |
| **Plugin Data API** | Obsidian App API | 1.5.0+ | 설정 저장소 |

### 2.2 실행 환경

- **운영체제**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+), iOS 14+, Android 10+
- **Obsidian 버전**: 1.5.0+
- **Dataview 버전**: 0.5.67+
- **네트워크**: localhost (127.0.0.1) 통신만 허용

### 2.3 의존성 제약사항

- **Dataview 필수**: Dataview 플러그인이 설치되어 있어야 함
- **로컬 전용**: 외부 네트워크 연결 없이 로컬에서만 실행
- **플러그인 데이터 경로**: `.obsidian/plugins/obsidian-error-catcher/` 사용

---

## 3. 가정 (Assumptions)

### 3.1 기술적 가정

| 가정 | 신뢰도 | 근거 | 위험도 |
|------|--------|------|--------|
| Dataviewjs의 dv.view()가 외부 파일을 로드할 수 있음 | 높음 | Dataviewjs 문서 | 낮음 |
| Dataviewjs에서 Obsidian App API에 접근 가능함 | 높음 | Dataviewjs 플러그인 아키텍처 | 낮음 |
| 모바일 환경에서 Dataviewjs가 정상 작동함 | 높음 | Obsidian Mobile Dataview 지원 | 낮음 |
| 플러그인 데이터 폴더에 접근 가능함 | 높음 | Obsidian 플러그인 API | 낮음 |

### 3.2 비즈니스 가정

| 가정 | 신뢰도 | 근거 | 위험도 |
|------|--------|------|--------|
| 사용자가 Dataview 플러그인을 설치할 것임 | 중간 | Dataview는 인기 플러그인 | 중간 |
| 단일 라인 사용법이 도입 장벽을 낮출 것임 | 높음 | 기존 DevTools 방식보다 간단 | 낮음 |
| 모바일 사용자가 새로운 접근법을 선호할 것임 | 높음 | DevTools 접근 불가 문제 해결 | 낮음 |

### 3.3 검증 방법

- **기술적 검증**: PoC로 Dataviewjs 템플릿 기능 확인
- **비즈니스 검증**: 모바일 사용자 테스트 및 피드백 수집

---

## 4. 요구사항 (Requirements - EARS Format)

### 4.1 보편적 요구사항 (Ubiquitous Requirements)

**REQ-U-001: 템플릿 가용성**
시스템은 **항상** 모든 Obsidian 플랫폼(데스크톱, 모바일, 태블릿)에서 사용 가능한 에러 캡처 템플릿을 제공해야 한다.

**REQ-U-002: 데이터 프라이버시**
시스템은 **항상** 에러 데이터를 로컬에만 저장하고 외부로 전송하지 않아야 한다 (Claude API 제외).

**REQ-U-003: 보안 통신**
시스템은 **항상** localhost 간 통신에서만 데이터를 전송해야 한다.

**REQ-U-004: 호환성**
시스템은 **항상** 기존 로컬 서버 API와 호환되어야 한다.

### 4.2 이벤트 기반 요구사항 (Event-Driven Requirements)

**REQ-E-001: 템플릿 로드 시 에러 핸들러 등록**
**WHEN** Dataviewjs가 error-catcher.js 템플릿을 로드할 때, **THE** 시스템 **SHALL** 글로벌 에러 핸들러를 자동으로 등록해야 한다.

**REQ-E-002: 노트 메타데이터 자동 감지**
**WHEN** 템플릿이 초기화될 때, **THE** 시스템 **SHALL** Dataviewjs API를 사용하여 현재 노트의 메타데이터를 자동으로 감지해야 한다.

**REQ-E-003: 에러 발생 시 전송**
**WHEN** JavaScript 에러가 발생하고 로컬 서버가 reachable 상태일 때, **THE** 시스템 **SHALL** 즉시 에러 데이터를 전송해야 한다.

**REQ-E-004: 설정 변경 시 동기화**
**WHEN** 사용자가 플러그인 설정을 변경할 때, **THE** 시스템 **SHALL** 변경된 설정을 모든 열린 노트에 동기화해야 한다.

**REQ-E-005: 오프라인 큐잉**
**WHEN** 로컬 서버가 unreachable 상태일 때, **THE** 시스템 **SHALL** 에러를 로컬 스토리지에 저장하고 서버 재접속 시 일괄 전송해야 한다.

### 4.3 상태 기반 요구사항 (State-Driven Requirements)

**REQ-S-001: 서버 상태 모니터링**
**IF** 로컬 서버가 실행 중인 상태일 때, **THE** 시스템 **SHALL** 실시간 에러 전송을 활성화해야 한다.

**REQ-S-002: 오프라인 모드**
**IF** 로컬 서버가 실행 중이지 않은 상태일 때, **THE** 시스템 **SHALL** 로컬 스토리지에 에러를 보존해야 한다.

**REQ-S-003: 민감 정보 포함 여부**
**IF** 에러 데이터에 민감 정보(비밀번호, 토큰 등)가 포함될 때, **THE** 시스템 **SHALL** 데이터를 마스킹 처리해야 한다.

**REQ-S-004: Dataviewjs 미설치 상태**
**IF** Dataview 플러그인이 설치되지 않은 상태일 때, **THE** 시스템 **SHALL** 사용자에게 Dataview 설치를 안내해야 한다.

### 4.4 바람직한 요구사항 (Optional Requirements)

**REQ-O-001: UI 설정 패널**
**가능하면** 시스템은 Obsidian 플러그인 설정 UI를 제공해야 한다.

**REQ-O-002: 에러 대시보드**
**가능하면** 시스템은 노트 내에서 에러 목록을 표시하는 Dataview 쿼리를 제공해야 한다.

**REQ-O-003: 통계 리포트**
**가능하면** 시스템은 에러 발생 통계 및 추이 분석 기능을 제공해야 한다.

### 4.5 바람직하지 않은 요구사항 (Unwanted Requirements)

**REQ-UW-001: 노트별 수동 설정 금지**
시스템은 **절대로** 각 노트마다 noteId, notePath를 수동으로 입력하게 하면 안 된다.

**REQ-UW-002: DevTools 의존 금지**
시스템은 **절대로** DevTools Console에 의존해서는 안 된다.

**REQ-UW-003: 외부 데이터 전송 금지**
시스템은 **절대로** 에러 데이터를 외부 서버로 전송하면 안 된다.

---

## 5. 상세 기능 명세 (Specifications)

### 5.1 Dataviewjs 템플릿 (error-catcher.js)

**목적**: Dataviewjs의 dv.view()로 호출 가능한 공통 에러 캡처 템플릿

**위치**: `.obsidian/plugins/dataview/error-catcher.js`
또는 사용자 Vault 루트: `scripts/error-catcher.js`

**기능 명세:**

1. **Dataviewjs Context 접근**
   ```javascript
   // Dataviewjs에서 제공하는 API
   - dv.current(): 현재 노트 메타데이터
   - app: Obsidian App 인스턴스
   ```

2. **자동 노트 메타데이터 감지**
   - 노트 파일 경로: `dv.current().file.path`
   - 노트 이름: `dv.current().file.name`
   - 노트 생성일: `dv.current().file.ctime`
   - 노트 수정일: `dv.current().file.mtime`
   - 노트 태그: `dv.current().file.etags`

3. **플러그인 설정 로드**
   - 설정 파일 경로: `.obsidian/plugins/obsidian-error-catcher/data.json`
   - 서버 URL 설정 로드
   - 에러 수집 활성화 상태 확인

4. **글로벌 에러 핸들러 등록**
   - window.onerror 등록
   - unhandledrejection 등록

**템플릿 인터페이스:**
```javascript
/**
 * error-catcher.js
 * Dataviewjs 템플릿 기반 에러 캡처
 *
 * 사용법:
 * ```dataviewjs
 * dv.view('/scripts/error-catcher', { serverUrl: 'http://localhost:4321' })
 * ```
 */

module.exports = (dv, options) => {
  // 옵션 기본값
  const config = {
    serverUrl: options?.serverUrl || 'http://localhost:4321',
    enabled: options?.enabled !== false, // 기본 활성화
    autoCapture: options?.autoCapture !== false
  };

  // 현재 노트 정보 자동 감지
  const currentNote = dv.current();
  const notePath = currentNote?.file?.path || 'unknown';
  const noteName = currentNote?.file?.name || 'unknown';

  // ErrorCatcher 초기화
  const catcher = new ErrorCatcher({
    serverUrl: config.serverUrl,
    noteId: noteName,
    notePath: notePath,
    obsidianVersion: app.version,
    platform: getPlatform()
  });

  // 글로벌 에러 핸들러 등록
  if (config.autoCapture) {
    catcher.captureGlobalErrors();
  }

  // 상태 표시 (사용자 피드백)
  dv.el('div', `Error Catcher 활성화: ${notePath}`, {
    cls: 'error-catcher-status',
    attr: { style: 'color: var(--text-muted); font-size: 0.8em;' }
  });

  return catcher;
};
```

### 5.2 플러그인 설정 관리 (Plugin Settings)

**목적**: 중앙 집중식 설정 관리를 위한 Obsidian 플러그인

**기능 명세:**

1. **설정 UI 제공**
   - 서버 URL 설정
   - 에러 수집 활성화/비활성화 토글
   - 자동 캡처 설정

2. **설정 저장소**
   - 경로: `.obsidian/plugins/obsidian-error-catcher/data.json`
   - 설정 동기화: 모든 노트에서 동일 설정 사용

3. **설정 구조:**
```json
{
  "serverUrl": "http://localhost:4321",
  "enabled": true,
  "autoCapture": true,
  "maskSensitiveData": true,
  "version": "1.0.0"
}
```

**플러그인 구조 (선택 사항):**
```typescript
// obsidian-error-catcher.ts
import { Plugin, PluginSettingTab, Setting } from 'obsidian';

interface ErrorCatcherSettings {
  serverUrl: string;
  enabled: boolean;
  autoCapture: boolean;
  maskSensitiveData: boolean;
}

export default class ObsidianErrorCatcherPlugin extends Plugin {
  settings: ErrorCatcherSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new ErrorCatcherSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, {
      serverUrl: 'http://localhost:4321',
      enabled: true,
      autoCapture: true,
      maskSensitiveData: true
    }, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

### 5.3 사용자 인터페이스 (User Interface)

**목적**: 간단한 사용법과 명확한 피드백 제공

**노트에서의 사용:**
```markdown
---
title: My Note
---

## My Dataview Content

```dataviewjs
// 에러 캡처 활성화 (서버 설정 사용)
dv.view('/scripts/error-catcher')

// 또는 커스텀 설정
dv.view('/scripts/error-catcher', {
  serverUrl: 'http://localhost:4321',
  enabled: true
})
```
```

**Dataview 쿼리로 에러 목록 표시 (선택 사항):**
```markdown
```dataview
TABLE errorType, message, timestamp
FROM "errors"
WHERE file.path = this.file.path
SORT timestamp DESC
```
```

---

## 6. 아키텍처 설계 (Architecture Design)

### 6.1 템플릿 기반 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Note                               │
│                                                                   │
│  ```dataviewjs                                                   │
│  dv.view('/scripts/error-catcher')                              │
│  ```                                                             │
│                                                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ dv.view() 호출
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    error-catcher.js                             │
│                    (공통 템플릿)                                 │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. Dataviewjs Context 접근                             │   │
│  │     - dv.current(): 노트 메타데이터                     │   │
│  │     - app: Obsidian App 인스턴스                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  2. 자동 메타데이터 감지                                │   │
│  │     - notePath: dv.current().file.path                  │   │
│  │     - noteName: dv.current().file.name                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  3. 플러그인 설정 로드                                   │   │
│  │     - .obsidian/plugins/.../data.json                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  4. ErrorCatcher 초기화                                 │   │
│  │     - 글로벌 에러 핸들러 등록                           │   │
│  │     - WebSocket/HTTP 전송                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP/WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Local Server (기존)                          │
│  Error Collector → Auto Analyzer → Auto Fixer                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 파일 구조

```
.obsidian/
├── plugins/
│   ├── dataview/
│   │   └── error-catcher.js          # Dataview 템플릿
│   └── obsidian-error-catcher/       # (선택) 설정 플러그인
│       ├── main.ts
│       ├── data.json                 # 설정 저장소
│       └── manifest.json
└── ...

scripts/
└── error-catcher.js                  # 대체 위치: Vault 루트

your-vault/
└── notes/
    ├── note-with-errors.md           # 사용자 노트
    │   └── ```dataviewjs
    │       dv.view('/scripts/error-catcher')
    │       ```
    └── ...
```

### 6.3 데이터 흐름

```
1. 노트 로드
   └─> Dataviewjs 코드 블록 파싱

2. dv.view() 호출
   ├─> error-catcher.js 로드
   ├─> dv.current()로 메타데이터 추출
   └─> 플러그인 설정 로드

3. ErrorCatcher 초기화
   ├─> 글로벌 에러 핸들러 등록
   ├─> 서버 연결 확인
   └─> 상태 표시 (사용자 피드백)

4. 에러 발생 시
   ├─> 캡처 (window.onerror / unhandledrejection)
   ├─> 메타데이터 자동 첨부
   └─> 서버로 전송

5. 오프라인 상태
   ├─> 로컬 스토리지에 큐잉
   └─> 재접속 시 일괄 전송
```

---

## 7. 보안 고려사항 (Security Considerations)

### 7.1 로컬 통신 제한

- **localhost만 허용**: 127.0.0.1 및 ::1만 접속 허용 (기존과 동일)
- **포트 노출 방지**: 방화벽 설정으로 외부 접속 차단

### 7.2 데이터 마스킹

기존 시스템과 동일한 마스킹 처리 적용 (SPEC-OBSIDIAN-ERROR-LOG-001 참조)

### 7.3 템플릿 보안

- **코드 실행 권한**: Dataviewjs는 이미 사용자의 Vault에서 실행 중이므로 추가 권한 불필요
- **플러그인 데이터 접근**: `.obsidian/plugins/` 경로만 접근 허용

---

## 8. 테스트 전략 (Testing Strategy)

### 8.1 단위 테스트

- **템플릿 로딩**: dv.view()가 템플릿을 올바르게 로드하는지 검증
- **메타데이터 감지**: dv.current()가 올바른 노트 정보를 반환하는지 검증
- **에러 캡처**: 글로벌 에러 핸들러가 에러를 올바르게 캡처하는지 검증

### 8.2 통합 테스트

- **End-to-End 플로우**: 노트 로드 → 템플릿 호출 → 에러 발생 → 전송
- **다중 플랫폼**: 데스크톱/모바일/태블릿에서 동작 확인
- **설정 동기화**: 설정 변경 시 모든 노트에 반영되는지 확인

### 8.3 사용자 테스트

- **모바일 사용자 테스트**: Obsidian Mobile에서 템플릿 동작 확인
- **사용성 테스트**: 단일 라인 사용법의 직관성 확인

---

## 9. 성능 요구사항 (Performance Requirements)

| 항목 | 목표 | 측정 방법 |
|------|------|-----------|
| 템플릿 로드 시간 | < 500ms | dv.view() 호출부터 초기화까지 |
| 메타데이터 감지 시간 | < 100ms | dv.current() 호출부터 완료까지 |
| 에러 캡처 지연시간 | < 100ms | 에러 발생부터 캡처까지 |
| 전송 지연시간 | < 500ms | 캡처부터 서버 수신까지 |

---

## 10. 추적성 (Traceability)

### 10.1 관련 문서

- **기존 SPEC**: SPEC-OBSIDIAN-ERROR-LOG-001 (로컬 서버 API)
- **프로젝트 구조**: `.moai/project/structure.md`
- **기술 스택**: `.moai/project/tech.md`
- **구현 계획**: `plan.md` (본 SPEC)
- **인수 기준**: `acceptance.md` (본 SPEC)

### 10.2 의존 SPEC

- **SPEC-OBSIDIAN-ERROR-LOG-001**: 로컬 서버 API (필수 의존)

### 10.3 추적 태그

```yaml
tags:
  - spec-obsidian-dv-error
  - dataviewjs
  - template-pattern
  - error-handling
  - mobile-support
  - obsidian-integration
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
| Dataviewjs 호환성 검토 | 대기 | - | - |
| 모바일 지원 검토 | 대기 | - | - |
| 사용자 테스트 | 대기 | - | - |
