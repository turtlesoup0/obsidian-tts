# SPEC-OBSIDIAN-DV-LLM-FIX-001: Dataviewjs LLM Auto-Fix System

## Metadata

| Field | Value |
|-------|-------|
| **SPEC ID** | SPEC-OBSIDIAN-DV-LLM-FIX-001 |
| **Title** | Dataviewjs LLM Auto-Fix System |
| **Status** | Planned |
| **Priority** | High |
| **Created** | 2026-02-04 |
| **Domain** | OBSIDIAN (Obsidian Plugin Development) |
| **Lifecycle** | spec-anchored |

## Background

Previous prototype testing revealed that Obsidian plugin global error handlers cannot capture Dataviewjs errors due to `evalInContext` isolation with try-catch blocks. Test results showed "Evaluation Error" messages only, with no propagation to global handlers.

Since automatic error capture is impossible in Dataviewjs, this SPEC implements a manual error reporting approach combined with LLM-powered automatic fixes.

## Environment

### Target Environment

- **Platform**: Obsidian (Desktop & Mobile)
- **Dataview Plugin**: v0.5.64+
- **Obsidian Version**: 1.5.0+
- **Backend**: Node.js/TypeScript server with Claude API integration

### Technical Context

- Dataviewjs code execution is isolated within `evalInContext`
- Global error handlers do not receive errors from Dataviewjs blocks
- Mobile devices lack DevTools for debugging
- Manual error reporting is the only viable approach

## Assumptions

| Assumption | Confidence | Risk if Wrong | Validation Method |
|------------|------------|---------------|-------------------|
| Claude API can analyze code with sufficient context | High | LLM cannot generate accurate fixes | Prototype with sample errors |
| Users are willing to add wrapper to code | Medium | Low adoption due to friction | User testing with real workflows |
| File modification API is safe enough | Medium | Data corruption/corruption | Extensive testing and backup mechanism |
| Error context provides enough information | High | Inaccurate fix proposals | Test with diverse error scenarios |

## Requirements (EARS Format)

### Phase 1: Dataviewjs Error Reporter Library

#### Ubiquitous Requirements

- **REQ-1.1**: 시스템은 에러 리포팅 라이브러리를 제공해야 한다
- **REQ-1.2**: 시스템은 사용자가 Dataviewjs 블록에서 쉽게 가져올 수 있는 템플릿을 제공해야 한다

#### Event-Driven Requirements

- **WHEN** 사용자가 `dv.view('/error-reporter', { code: () => { ... } })` 형식으로 코드를 감싸면, **THEN** 시스템은 에러를 캡처하고 백엔드로 전송해야 한다

- **WHEN** 에러가 발생하면, **THEN** 시스템은 에러 메시지, 스택 트레이스, 코드 스니펫, 노트 메타데이터를 수집해야 한다

#### State-Driven Requirements

- **IF** 사용자가 `wrap: true` 옵션을 설정하면, **THEN** 시스템은 자동으로 에러 처리 래퍼를 적용해야 한다

#### Unwanted Requirements

- 시스템은 사용자의 원본 코드를 수정하지 않아야 한다 (래퍼만 추가)
- 시스템은 에러 리포팅이 실패해도 원본 코드 실행을 방해하지 않아야 한다

### Phase 2: Backend Error Analysis API

#### Ubiquitous Requirements

- **REQ-2.1**: 백엔드는 `POST /api/analyze-error` 엔드포인트를 제공해야 한다
- **REQ-2.2**: 백엔드는 모든 에러 분석 요청을 로깅해야 한다

#### Event-Driven Requirements

- **WHEN** 클라이언트가 에러 분석 요청을 보내면, **THEN** 백엔드는 노트 콘텐츠를 검색하고 Claude API로 전송해야 한다

- **WHEN** Claude API가 수정 제안을 반환하면, **THEN** 백엔드는 수정 사항의 안전성을 검증해야 한다

#### State-Driven Requirements

- **IF** 노트 파일을 찾을 수 없으면, **THEN** 시스템은 에러 메시지와 함께 사용자에게 알려야 한다

### Phase 3: LLM Fix Generation

#### Ubiquitous Requirements

- **REQ-3.1**: Claude API는 에러 컨텍스트를 기반으로 수정 제안을 생성해야 한다
- **REQ-3.2**: 생성된 수정 사항은 안전성 검증을 통과해야 한다

#### Event-Driven Requirements

- **WHEN** 에러 분석 요청이 도착하면, **THEN** 시스템은 에러 메시지, 스택 트레이스, 전체 노트 콘텐츠, 관련 코드 패턴을 Claude API에 전달해야 한다

- **WHEN** Claude API가 수정 제안을 반환하면, **THEN** 시스템은 제안된 코드의 구문을 검증하고 파싱해야 한다

#### State-Driven Requirements

- **IF** Claude API가 수정 제안을 생성할 수 없으면, **THEN** 시스템은 에러 설명만 반환해야 한다

### Phase 4: Auto-Fix Application

#### Ubiquitous Requirements

- **REQ-4.1**: 시스템은 파일 수정 전 자동 백업을 생성해야 한다
- **REQ-4.2**: 모든 수정은 사용자 확인 후 적용해야 한다

#### Event-Driven Requirements

- **WHEN** 사용자가 수정 적용을 확인하면, **THEN** 시스템은 노트 파일을 수정하고 백업을 생성해야 한다

- **WHEN** 수정 적용 중 에러가 발생하면, **THEN** 시스템은 백업에서 복원해야 한다

#### Unwanted Requirements

- 시스템은 사용자 확인 없이 파일을 자동 수정하지 않아야 한다
- 시스템은 백업 없이 파일을 덮어쓰지 않아야 한다

### Phase 5: Testing

#### Ubiquitous Requirements

- **REQ-5.1**: 모든 에러 시나리오는 테스트 케이스를 가져야 한다
- **REQ-5.2**: 롤백 메커니즘은 테스트되어야 한다

## Specifications

### Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Workflow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User writes Dataviewjs code:                                │
│     ```dataviewjs                                                │
│     dv.view('/error-reporter', {                                 │
│       wrap: true,                                                │
│       code: () => {                                              │
│         // user code here                                        │
│         const result = dangerousOperation();                     │
│         return result;                                           │
│       }                                                           │
│     });                                                          │
│     ```                                                          │
│                                                                   │
│  2. Error occurs → Caught by wrapper → Sent to backend          │
│                                                                   │
│  3. LLM analyzes → Generates fix → User confirms → Fix applied  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Design

#### 1. Error Reporter Library (`error-reporter.js`)

```javascript
// Location: .obsidian/plugins/your-plugin/scripts/error-reporter.js

/**
 * Error Reporter for Dataviewjs
 * Manual error reporting with LLM-powered auto-fix
 */

class ErrorReporter {
  constructor(dv, options = {}) {
    this.dv = dv;
    this.apiEndpoint = options.apiEndpoint || 'http://localhost:3000/api/analyze-error';
    this.autoFix = options.autoFix !== false;
  }

  /**
   * Wrap user code with error handling
   */
  wrap(codeFn) {
    try {
      const result = codeFn();
      return { success: true, data: result };
    } catch (error) {
      this.reportError(error, codeFn.toString());
      return { success: false, error: error.message };
    }
  }

  /**
   * Report error to backend
   */
  async reportError(error, codeSnippet) {
    const context = {
      notePath: this.dv.current().file.path,
      noteName: this.dv.current().file.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      codeSnippet: codeSnippet,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
      });

      const analysis = await response.json();

      if (this.autoFix && analysis.fix) {
        return this.proposeFix(analysis);
      }

      return analysis;
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
      return { error: 'Failed to report error' };
    }
  }

  /**
   * Propose fix to user
   */
  proposeFix(analysis) {
    // Display fix proposal in Obsidian UI
    const fixUI = `
      ## Error Analysis
      **Error**: ${analysis.error}

      **Explanation**: ${analysis.explanation}

      **Proposed Fix**:
      \`\`\`javascript
      ${analysis.fix}
      \`\`\`

      [Apply Fix] [Dismiss]
    `;

    this.dv.el('div', fixUI);
    return analysis;
  }
}

// Export for Dataviewjs view
module.exports = (params) => {
  const { dv } = params;
  const reporter = new ErrorReporter(dv, params);

  if (params.wrap && params.code) {
    return reporter.wrap(params.code);
  }

  return reporter;
};
```

#### 2. Backend API (`error-analysis.ts`)

```typescript
// Location: backend/src/routes/error-analysis.ts

import express from 'express';
import { ClaudeService } from '../services/claude';
import { VaultService } from '../services/vault';
import { FixValidator } from '../validators/fix';

const router = express.Router();

interface ErrorContext {
  notePath: string;
  noteName: string;
  errorMessage: string;
  stackTrace: string;
  codeSnippet: string;
  timestamp: string;
}

router.post('/analyze-error', async (req, res) => {
  const context: ErrorContext = req.body;

  try {
    // 1. Retrieve full note content
    const noteContent = await VaultService.getNoteContent(context.notePath);

    // 2. Prepare analysis prompt for Claude
    const analysisPrompt = `
Analyze this Dataviewjs error and provide a fix:

Error Message: ${context.errorMessage}
Stack Trace: ${context.stackTrace}
Problematic Code:
${context.codeSnippet}

Full Note Content:
${noteContent}

Please provide:
1. Root cause explanation
2. Corrected code snippet
3. Explanation of the fix
`;

    // 3. Call Claude API
    const claudeResponse = await ClaudeService.analyze(analysisPrompt);

    // 4. Validate the fix
    const validation = await FixValidator.validate(claudeResponse.fix);

    if (!validation.isValid) {
      return res.status(200).json({
        error: context.errorMessage,
        explanation: claudeResponse.explanation,
        fix: null,
        validationErrors: validation.errors
      });
    }

    // 5. Return analysis result
    res.json({
      error: context.errorMessage,
      explanation: claudeResponse.explanation,
      fix: claudeResponse.fix,
      confidence: claudeResponse.confidence,
      requiresUserConfirmation: true
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to analyze error',
      details: error.message
    });
  }
});

export default router;
```

### Error Scenarios

| Scenario | Description | Expected Behavior |
|----------|-------------|-------------------|
| **Runtime Error** | TypeError, ReferenceError | Capture error, send to backend, propose fix |
| **Async Error** | Promise rejection | Capture in async wrapper, report properly |
| **Syntax Error** | Invalid JavaScript | Report syntax error location, suggest correction |
| **API Error** | Dataview API misuse | Explain API usage, provide corrected example |
| **Network Error** | Backend unreachable | Fall back to local error display only |
| **Validation Failure** | LLM fix is invalid | Show explanation only, don't propose fix |

### Safety Measures

1. **Backup Before Apply**
   - Create `.backup` subdirectory
   - Timestamp each backup
   - Keep last 10 backups

2. **User Confirmation**
   - Show diff view before applying
   - Require explicit user action
   - Provide undo option

3. **Validation**
   - Parse generated code for syntax errors
   - Check for suspicious patterns (eval, dangerous APIs)
   - Verify fix actually addresses the error

4. **Rollback**
   - Automatic rollback on failure
   - Manual rollback from backup history
   - Notification of rollback status

## Traceability

**TAG-BLOCK**: SPEC-OBSIDIAN-DV-LLM-FIX-001

**Related Requirements**:
- User experience flow: REQ-1.1, REQ-1.2, REQ-4.2
- Backend API: REQ-2.1, REQ-2.2, REQ-3.1, REQ-3.2
- Error handling: REQ-1.2, REQ-2.2, REQ-4.1

**Dependencies**:
- Claude API access (Anthropic)
- Obsidian Vault API access
- File system write permissions

**Next Steps**:
- → /moai:2-run SPEC-OBSIDIAN-DV-LLM-FIX-001
- → Create implementation branch: `feature/dv-llm-autofix`
