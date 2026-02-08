# SPEC-OBSIDIAN-DV-FIX-001

## SPEC Metadata

| Field | Value |
|------|-------|
| **SPEC ID** | SPEC-OBSIDIAN-DV-FIX-001 |
| **Title** | Dataviewjs Error Catcher Integration Fix |
| **Created** | 2026-02-04 |
| **Status** | Planned |
| **Priority** | High |
| **Assignee** | tbd |
| **Lifecycle** | spec-first |
| **Related SPECs** | SPEC-OBSIDIAN-DV-ERROR-001 (original implementation), SPEC-OBSIDIAN-ERROR-LOG-001 (local server) |
| **Supersedes** | SPEC-OBSIDIAN-DV-ERROR-001 |

---

## 1. Background (Background)

### 1.1 Current Problem Statement

**User's Core Requirement:**
> "note에 임포트된 에러캐처를 통해 자동 회복하는게 이 프로젝트의 본질"

The error catcher must:
- Load via `dv.view()` in any note
- Automatically capture JavaScript errors
- Automatically send to local server
- Work on mobile (no DevTools access)

### 1.2 Previous Implementation Attempts

| Attempt | Description | Result | Root Cause |
|---------|-------------|--------|------------|
| **Complex template** | 823 lines with visual feedback | Failed to load | Exceeded Dataviewjs capacity |
| **IIFE pattern** | Immediately Invoked Function Expression | ReferenceError: options is not defined | Syntax incompatibility |
| **CommonJS format** | module.exports with advanced features | No output, silent failure | Template execution context isolation |
| **Simplified template** | 310 lines, reduced complexity | Still no output | Unknown - needs investigation |

### 1.3 Symptom Analysis

**Observable Issues:**

1. **No Visible Output**: `dv.paragraph()` produces no visible text in note
2. **Silent Failure**: No console errors, template appears to load but does nothing
3. **No Error Capture**: Global error handlers don't capture JavaScript errors
4. **Mobile Uncertainty**: Unable to verify behavior on Obsidian Mobile

**Potential Root Causes:**

1. **Template Execution Context**: Dataviewjs may run templates in isolated scope where `dv.paragraph()` output doesn't render
2. **Global Handler Scope**: Error handlers registered in template context may not capture errors outside template scope
3. **TypeScript Syntax**: Advanced template contains `as any` TypeScript syntax causing JavaScript errors
4. **Module Loading**: `module.exports` pattern may not work correctly with Dataviewjs `dv.view()`

### 1.4 Architecture Hypothesis

```
Current Hypothesized Flow (BROKEN):
┌─────────────────────────────────────────────────────────────────┐
│  User Note                                                       │
│  ```dataviewjs                                                   │
│  dv.view('/dataviewjs-templates/error-catcher')                  │
│  ```                                                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ dv.view() call
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  error-catcher.js (Template Context - ISOLATED)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. module.exports = (dv, options) => {...}              │   │
│  │  2. dv.paragraph("Status...")  ← No visible output        │   │
│  │  3. window.addEventListener('error', handler)            │   │
│  │     ← Handler registered in TEMPLATE scope only           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Page Context (Global Errors)                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  JavaScript error occurs in page/dataviewjs code         │   │
│  │  ❌ Handler NOT triggered - wrong scope                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Environment (Environment)

### 2.1 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Obsidian Desktop** | Electron | Latest | Desktop runtime |
| **Obsidian Mobile** | Capacitor | Latest | Mobile runtime |
| **Dataview Plugin** | dataview | 0.5.67+ | Template engine |
| **Template Runtime** | JavaScript | ES2022+ | Execution environment |
| **Local Server** | Node.js | 20+ LTS | Error collection server |
| **API Protocol** | HTTP/WebSocket | - | Error transmission |

### 2.2 Execution Environment

- **Operating Systems**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+), iOS 14+, Android 10+
- **Obsidian Version**: 1.5.0+
- **Dataview Version**: 0.5.67+
- **Network**: localhost (127.0.0.1:4321)

### 2.3 Dataviewjs API Constraints

**Known Limitations:**
- `dv.view()` executes templates in isolated context
- `dv.paragraph()` may not render in all contexts
- `dv.el()` creates DOM elements but placement is context-dependent
- Global scope access may be limited

**Known Capabilities:**
- `dv.current()` returns current note metadata
- `dv.el()` creates DOM elements
- Templates can access `window` object
- Templates can register event listeners

---

## 3. Assumptions (Assumptions)

### 3.1 Technical Assumptions

| Assumption | Confidence | Evidence | Risk |
|------------|------------|----------|------|
| Dataviewjs `dv.view()` executes JavaScript in global scope | Low | Mixed evidence - isolation observed | High |
| `dv.paragraph()` output is visible in reading mode | Medium | Dataview documentation | Medium |
| Global error handlers registered in template persist | Low | Current behavior suggests no | High |
| Obsidian Mobile Dataviewjs behaves same as desktop | Medium | Obsidian documentation | Medium |
| TypeScript `as any` syntax causes JavaScript errors | High | Syntax error pattern | Low |

### 3.2 Validation Requirements

- [HARD] **Critical Path Validation**: Verify `dv.view()` execution model with minimal test
- [HARD] **Scope Testing**: Confirm global error handler registration scope
- [SOFT] **Mobile Testing**: Verify behavior on Obsidian Mobile

---

## 4. Requirements (EARS Format)

### 4.1 Ubiquitous Requirements

**REQ-U-001: Fundamental Functionality**
The system **shall always** capture JavaScript errors from Dataviewjs code blocks and user notes when the error catcher is activated.

**REQ-U-002: Server Communication**
The system **shall always** transmit captured errors to the local server at `http://127.0.0.1:4321/api/errors`.

**REQ-U-III-003: Cross-Platform Compatibility**
The system **shall always** work on Obsidian Desktop, iOS, and Android platforms.

**REQ-U-004: Zero Configuration**
The system **shall always** work with default configuration without requiring manual setup beyond template import.

### 4.2 Event-Driven Requirements

**REQ-E-001: Template Load Initialization**
**WHEN** a note loads containing the `dv.view()` call to error-catcher, **THE** system **SHALL** initialize error capture and display visual confirmation.

**REQ-E-002: Error Capture Trigger**
**WHEN** a JavaScript error occurs in any Dataviewjs block or note context, **THE** system **SHALL** capture the error with full stack trace and context.

**REQ-E-003: Error Transmission**
**WHEN** an error is captured and the local server is reachable, **THE** system **SHALL** immediately transmit the error data via HTTP POST.

**REQ-E-004: Offline Queue**
**WHEN** an error is captured and the local server is unreachable, **THE** system **SHALL** queue the error in localStorage for later transmission.

**REQ-E-005: Queue Retry**
**WHEN** the template loads and offline queue has pending errors, **THE** system **SHALL** attempt to transmit queued errors.

### 4.3 State-Driven Requirements

**REQ-S-001: Verbose Mode**
**IF** `verbose: true` option is provided, **THE** system **SHALL** output detailed debug information to console and display status in note.

**REQ-S-002: Disabled State**
**IF** `enabled: false` option is provided, **THE** system **SHALL** skip error handler registration but still display status message.

**REQ-S-003: Mobile Detection**
**IF** the platform is detected as iOS or Android, **THE** system **SHALL** optimize for mobile constraints (no DevTools access).

### 4.4 Unwanted Requirements

**REQ-UW-001: No TypeScript Syntax**
The system **shall not** contain TypeScript-specific syntax (e.g., `as any`, type annotations) in the JavaScript template.

**REQ-UW-002: No Silent Failures**
The system **shall not** fail silently without any user feedback when template loading or initialization fails.

**REQ-UW-003: No DevTools Dependency**
The system **shall not** require DevTools Console access for any functionality.

### 4.5 Optional Requirements

**REQ-O-001: Visual Feedback**
**Where possible**, the system **SHALL** display a visible status indicator in the note showing error catcher state.

**REQ-O-002: Obsidian Plugin Integration**
**Where possible**, the system **MAY** provide an Obsidian plugin for centralized settings management.

---

## 5. Specifications (Specifications)

### 5.1 Root Cause Analysis (Current Understanding)

**Issue 1: Template Execution Context**

**Problem**: `dv.paragraph()` content not visible in note
**Hypothesis**: Dataviewjs executes templates in context where paragraph output is suppressed
**Validation**: Create minimal test template with only `dv.paragraph()` and verify visibility

**Issue 2: Global Error Handler Scope**

**Problem**: Error handlers registered in template don't capture errors
**Hypothesis**: Template execution scope is isolated from global error event propagation
**Validation**: Register handler in template, trigger error in separate context, verify capture

**Issue 3: TypeScript Syntax**

**Problem**: `as any` syntax in JavaScript file causes errors
**Evidence**: Line 84 in advanced template: `(window as any).MSStream`
**Solution**: Replace with `window.MSStream` or use optional chaining

### 5.2 Alternative Implementation Approaches

#### Approach A: Fixed Dataviewjs Template (Primary)

**Strategy**: Fix existing template by addressing syntax and scope issues

**Changes Required:**
1. Remove TypeScript syntax (`as any`)
2. Verify `dv.paragraph()` vs `dv.el()` for output
3. Test global error handler registration scope
4. Add visual feedback using DOM elements

**Advantages:**
- Maintains existing architecture
- Single template file approach
- Minimal user changes required

**Disadvantages:**
- May not resolve scope issues if fundamental
- Dependent on Dataviewjs behavior

#### Approach B: Obsidian Plugin (Fallback)

**Strategy**: Create native Obsidian plugin that registers global error handlers at plugin load time

**Implementation:**
```typescript
// .obsidian/plugins/obsidian-error-catcher/main.ts
import { Plugin } from 'obsidian';

export default class ErrorCatcherPlugin extends Plugin {
  async onload() {
    // Register global error handlers at PLUGIN level
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleRejection);

    // Register API for Dataviewjs access
    window.errorCatcherAPI = {
      capture: this.captureError.bind(this),
      config: this.settings
    };
  }
}
```

**Usage in Note:**
```dataviewjs
// Simple API call to plugin
if (window.errorCatcherAPI) {
  window.errorCatcherAPI.capture(new Error('test'));
}
```

**Advantages:**
- Guaranteed global scope
- Proper error handler registration
- Persistent across note navigation
- Settings UI possible

**Disadvantages:**
- Requires plugin installation
- More complex deployment
- Additional file to maintain

#### Approach C: Inline Script with Manual Activation (Hybrid)

**Strategy**: Use Dataviewjs to inject inline `<script>` tag that registers global handlers

**Implementation:**
```javascript
module.exports = (dv) => {
  // Create script element with global handler registration
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      if (window.obsidianErrorCatcherInstalled) return;
      window.obsidianErrorCatcherInstalled = true;

      window.addEventListener('error', function(e) {
        // Capture and send error
        fetch('http://127.0.0.1:4321/api/errors', {
          method: 'POST',
          body: JSON.stringify({
            errorType: e.error?.name || 'Error',
            message: e.error?.message || e.message,
            stackTrace: e.error?.stack || ''
          })
        });
      });
    })();
  `;
  document.head.appendChild(script);

  dv.paragraph('Error Catcher installed');
};
```

**Advantages:**
- Guaranteed global execution scope
- Works with Dataviewjs template
- Single file solution

**Disadvantages:**
- Injects script into page DOM
- Less elegant architecture
- May trigger CSP warnings

### 5.3 Recommended Implementation Strategy

**Phase 1: Validation (Critical First Step)**

Create minimal test templates to validate Dataviewjs behavior:

1. **Test 1: Basic Output**
   ```javascript
   // test-1-basic-output.js
   module.exports = (dv) => {
     dv.paragraph("Test: Basic paragraph output");
     const el = dv.el('div', 'Test: Element output');
     console.log("Test: Console output");
   };
   ```

2. **Test 2: Global Handler**
   ```javascript
   // test-2-global-handler.js
   module.exports = (dv) => {
     window.testHandler = () => console.log("Handler called");
     window.addEventListener('test-event', () => console.log("Event triggered"));
     dv.paragraph("Global handler registered");
   };
   ```

3. **Test 3: Error Capture**
   ```javascript
   // test-3-error-capture.js
   module.exports = (dv) => {
     let captured = false;
     window.addEventListener('error', () => { captured = true; });
     setTimeout(() => {
       try { throw new Error("Test"); } catch(e) {}
       dv.paragraph("Captured: " + captured);
     }, 100);
   };
   ```

**Phase 2: Fix Implementation Based on Results**

Based on Phase 1 results:

- **If basic output works**: Fix syntax issues, keep existing approach
- **If handlers work in template**: Fix registration timing/scope
- **If handlers don't work**: Implement Approach B (Plugin) or C (Inline Script)

### 5.4 Technical Specifications for Fixed Template

**File Location**: `dataviewjs-templates/error-catcher.js`

**Module Signature**:
```javascript
module.exports = (dv, options) => {
  // Pure JavaScript - NO TypeScript syntax
  // Returns: { captureError, config, status }
};
```

**Required Functions**:
1. `captureError(error, context)` - Manual error capture
2. `sendError(errorData)` - Transmit to server
3. `getPlatform()` - Detect platform
4. `showStatus(message)` - Display visual feedback

**Configuration Options**:
```javascript
{
  serverUrl: string,      // Default: 'http://127.0.0.1:4321'
  enabled: boolean,       // Default: true
  autoCapture: boolean,   // Default: true
  verbose: boolean        // Default: false
}
```

---

## 6. Testing Strategy (Testing Strategy)

### 6.1 Validation Tests (Phase 1)

**Test V-1: Basic Output Visibility**
- **Given**: A note with minimal test template
- **When**: Note is opened in reading mode
- **Then**: `dv.paragraph()` content MUST be visible

**Test V-2: Global Handler Registration**
- **Given**: A template that registers global error handler
- **When**: JavaScript error is triggered in separate code block
- **Then**: Handler MUST be triggered

**Test V-3: Error Transmission**
- **Given**: Error handler is registered
- **When**: Error is captured
- **Then**: Error MUST appear in local server logs

### 6.2 Integration Tests (Phase 2)

**Test I-1: End-to-End Error Flow**
1. Create note with error catcher template
2. Trigger JavaScript error in Dataviewjs block
3. Verify error appears in local server database

**Test I-2: Offline Queue**
1. Stop local server
2. Trigger error
3. Verify queued in localStorage
4. Start server
5. Verify error transmitted

**Test I-3: Multi-Platform**
1. Test on Obsidian Desktop
2. Test on Obsidian Mobile (iOS)
3. Test on Obsidian Mobile (Android)

### 6.3 Mobile Testing Strategy

**Challenge**: No DevTools access on mobile

**Solutions**:
1. **Visual Feedback**: Status indicator in note
2. **Server Logs**: Check local server for received errors
3. **Offline Queue**: Check localStorage via server endpoint
4. **Test Note**: Create note with intentional errors

---

## 7. Success Criteria (Acceptance Criteria)

### 7.1 Functional Requirements

- [FR-1] Template loads without syntax errors
- [FR-2] Visual confirmation is displayed in note when activated
- [FR-3] JavaScript errors are captured from Dataviewjs blocks
- [FR-4] Captured errors are transmitted to local server
- [FR-5] Offline queue stores errors when server unavailable
- [FR-6] Queued errors are transmitted when server becomes available

### 7.2 Non-Functional Requirements

- [NFR-1] No TypeScript syntax in JavaScript template
- [FR-2] No silent failures - all errors produce feedback
- [NFR-3] Works on Obsidian Desktop
- [NFR-4] Works on Obsidian Mobile (iOS/Android)
- [NFR-5] Single-line activation: `dv.view('/dataviewjs-templates/error-catcher')`

### 7.3 Definition of Done

A fix is considered complete when:
1. Validation tests identify the root cause
2. Fixed template passes all integration tests
3. Error capture works on desktop and mobile
4. Visual feedback confirms activation
5. Documentation is updated with troubleshooting steps

---

## 8. Security Considerations (Security)

### 8.1 Data Privacy

- **Local Only**: All data transmitted to localhost only
- **No External Calls**: No requests to external servers
- **Sensitive Data Masking**: Passwords, tokens, emails masked in transmission

### 8.2 Code Safety

- **No eval()**: Avoid dynamic code execution
- **CSP Compliance**: Don't violate Content Security Policy
- **XSS Prevention**: Sanitize all error messages before display

---

## 9. Traceability (Traceability)

### 9.1 Related Documents

- **Original SPEC**: SPEC-OBSIDIAN-DV-ERROR-001
- **Server SPEC**: SPEC-OBSIDIAN-ERROR-LOG-001
- **Implementation Report**: DDD_IMPLEMENTATION_REPORT.md
- **Template README**: dataviewjs-templates/README.md

### 9.2 Trace Tags

```yaml
tags:
  - spec-obsidian-dv-fix
  - dataviewjs-integration
  - error-capture
  - mobile-support
  - root-cause-analysis
  - alternative-implementations
```

---

## 10. Change History (Change History)

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-02-04 | Initial SPEC - Root cause analysis and alternative approaches | MoAI |

---

## 11. References (References)

1. Dataview Plugin Documentation: https://github.com/blacksmithgu/obsidian-dataview
2. Obsidian Plugin Development: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
3. Dataviewjs API Reference: https://blacksmithgu.github.io/obsidian-dataview/api/code
