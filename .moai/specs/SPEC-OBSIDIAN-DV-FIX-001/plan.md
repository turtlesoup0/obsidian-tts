# SPEC-OBSIDIAN-DV-FIX-001: Implementation Plan

**SPEC ID**: SPEC-OBSIDIAN-DV-FIX-001
**Related SPEC**: spec.md
**Status**: Planned
**Last Updated**: 2026-02-04

---

## 1. Implementation Strategy Overview

### 1.1 Problem Analysis Phase

**Current Understanding**:
- Templates load but produce no visible output
- Error handlers don't capture errors
- Potential root causes: execution context, syntax issues, scope isolation

**Approach**: Systematic validation before implementation

### 1.2 Decision Framework

```
Validation Results → Implementation Path
├── Basic output works AND handlers work → Fix syntax only
├── Basic output works BUT handlers fail → Implement plugin approach
└── Basic output fails → Investigate Dataviewjs limitations
```

---

## 2. Implementation Phases

### Phase 1: Root Cause Validation (Primary Goal)

**Priority**: High
**Estimated Complexity**: Medium
**Dependencies**: None

#### Milestone 1.1: Basic Output Validation

**Objective**: Verify `dv.paragraph()` and `dv.el()` produce visible output

**Tasks**:
1. Create `test-1-basic-output.js` with minimal test
2. Place in `dataviewjs-templates/` directory
3. Create test note with `dv.view()` call
4. Observe in Reading Mode
5. Document results

**Success Criteria**:
- [ ] Paragraph text is visible in note
- [ ] Element text is visible in note
- [ ] Console output appears in DevTools

**Acceptance Test**:
```javascript
// test-1-basic-output.js
module.exports = (dv) => {
  dv.paragraph("PARAGRAPH_TEST: If you see this, paragraph works");
  dv.el('div', 'ELEMENT_TEST: If you see this, element works');
  console.log("CONSOLE_TEST: If you see this in DevTools, console works");
};
```

#### Milestone 1.2: Global Handler Scope Validation

**Objective**: Verify event handlers registered in template capture global errors

**Tasks**:
1. Create `test-2-global-handler.js` with test event
2. Create test note that triggers custom event
3. Verify handler receives event
4. Document scope behavior

**Success Criteria**:
- [ ] Handler can be registered in template
- [ ] Handler receives events from same context
- [ ] Handler receives events from different context

**Acceptance Test**:
```javascript
// test-2-global-handler.js
module.exports = (dv) => {
  window.testEventHandler = (e) => {
    console.log("HANDLER_INVOKED:", e.detail);
    dv.paragraph("HANDLER_TEST: Event received - " + e.detail);
  };
  window.addEventListener('test-event', window.testEventHandler);
  dv.paragraph("Test: Custom event handler registered");

  // Trigger test event after delay
  setTimeout(() => {
    const event = new CustomEvent('test-event', { detail: 'test-value' });
    window.dispatchEvent(event);
  }, 500);
};
```

#### Milestone 1.3: Error Capture Validation

**Objective**: Verify error handlers can capture JavaScript errors

**Tasks**:
1. Create `test-3-error-capture.js` with error handler
2. Create test note that throws error
3. Verify error is captured
4. Document capture behavior

**Success Criteria**:
- [ ] Error handler registration succeeds
- [ ] Errors in template are captured
- [ ] Errors in other contexts are captured (if applicable)

**Acceptance Test**:
```javascript
// test-3-error-capture.js
module.exports = (dv) => {
  let captured = false;
  let capturedError = null;

  const handler = (e) => {
    captured = true;
    capturedError = e.error;
    console.log("ERROR_CAPTURED:", e.error?.message);
  };

  window.addEventListener('error', handler);
  dv.paragraph("ERROR_TEST: Error handler registered");

  // Trigger test error after delay
  setTimeout(() => {
    try {
      throw new Error("TEST_ERROR_FROM_TEMPLATE");
    } catch(e) {
      console.log("ERROR_THROWN:", e.message);
    }
  }, 500);

  // Check result after another delay
  setTimeout(() => {
    dv.paragraph("CAPTURED: " + captured);
    if (capturedError) {
      dv.paragraph("ERROR_MESSAGE: " + capturedError.message);
    }
  }, 1000);
};
```

#### Milestone 1.4: Server Transmission Validation

**Objective**: Verify error data can be transmitted to local server

**Tasks**:
1. Create `test-4-server-transmission.js`
2. Start local server
3. Trigger error transmission
4. Verify server receives data

**Success Criteria**:
- [ ] fetch() is available in Dataviewjs context
- [ ] POST request to server succeeds
- [ ] Server logs show received error

**Acceptance Test**:
```javascript
// test-4-server-transmission.js
module.exports = (dv) => {
  const testData = {
    id: 'test-' + Date.now(),
    timestamp: Date.now(),
    test: true,
    message: 'Test error from Dataviewjs'
  };

  const serverUrl = 'http://127.0.0.1:4321/api/errors';

  dv.paragraph("SERVER_TEST: Attempting transmission...");

  fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testData)
  })
  .then(res => {
    dv.paragraph("STATUS: HTTP " + res.status);
    return res.json();
  })
  .then(data => {
    dv.paragraph("RESPONSE: " + JSON.stringify(data));
  })
  .catch(err => {
    dv.paragraph("ERROR: " + err.message);
  });
};
```

### Phase 2: Fix Implementation (Based on Validation Results)

**Priority**: High
**Dependencies**: Phase 1 completion

#### Path A: Template Fix (If Validation Succeeds)

**When to Use**: Basic output works AND global handlers work

**Milestone 2.1: Syntax Correction**

**Tasks**:
1. Remove TypeScript syntax (`as any`)
2. Fix optional chaining for older environments
3. Ensure pure JavaScript compatibility

**Changes**:
```javascript
// BEFORE (TypeScript syntax - BROKEN)
if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
  return 'ios';
}

// AFTER (Pure JavaScript - FIXED)
if (/iPad|iPhone|iPod/.test(userAgent) && typeof window.MSStream === 'undefined') {
  return 'ios';
}
```

**Milestone 2.2: Visual Feedback Enhancement**

**Tasks**:
1. Replace `dv.paragraph()` with `dv.el()` for better control
2. Add CSS styling for visibility
3. Create status indicator element

**Changes**:
```javascript
// Create visible status element
const statusEl = dv.el('div', '', {
  cls: 'error-catcher-status',
  attr: {
    style: `
      padding: 8px 12px;
      background: var(--background-secondary);
      border-left: 3px solid var(--text-success);
      color: var(--text-muted);
      font-size: 0.85em;
      margin: 8px 0;
    `
  }
});

statusEl.appendChild(document.createTextNode(
  `Error Catcher: ${noteMetadata.name} (${getPlatform()})`
));
```

**Milestone 2.3: Error Handler Registration Fix**

**Tasks**:
1. Ensure handlers are registered at window level
2. Add registration confirmation check
3. Implement fallback if registration fails

**Changes**:
```javascript
function registerErrorHandlers() {
  if (typeof window === 'undefined') {
    Logger.warn('Window object not available');
    return false;
  }

  // Register error handler
  window.addEventListener('error', globalErrorHandler);
  Logger.log('window.error handler registered');

  // Register unhandledrejection handler
  window.addEventListener('unhandledrejection', unhandledRejectionHandler);
  Logger.log('unhandledrejection handler registered');

  return true;
}

// Verify registration
const registered = registerErrorHandlers();
if (registered) {
  showStatus('Error handlers registered successfully');
} else {
  showStatus('WARNING: Error handler registration failed');
}
```

#### Path B: Obsidian Plugin (If Validation Fails)

**When to Use**: Global handlers don't work in template context

**Milestone 2.4: Plugin Structure Creation**

**Tasks**:
1. Create `.obsidian/plugins/obsidian-error-catcher/` directory
2. Create `main.ts` plugin file
3. Create `manifest.json`
4. Create `styles.css`

**Plugin Template**:
```typescript
// main.ts
import { Plugin, Notice } from 'obsidian';

interface ErrorCatcherSettings {
  serverUrl: string;
  enabled: boolean;
  autoCapture: boolean;
  verbose: boolean;
}

const DEFAULT_SETTINGS: ErrorCatcherSettings = {
  serverUrl: 'http://127.0.0.1:4321',
  enabled: true,
  autoCapture: true,
  verbose: false
};

export default class ObsidianErrorCatcherPlugin extends Plugin {
  settings: ErrorCatcherSettings;
  handlerRegistered: boolean = false;

  async onload() {
    await this.loadSettings();

    // Register global error handlers at plugin level
    if (this.settings.autoCapture) {
      this.registerGlobalHandlers();
    }

    // Expose API for Dataviewjs access
    window.errorCatcherAPI = {
      capture: this.captureError.bind(this),
      config: this.settings,
      send: this.sendError.bind(this)
    };

    new Notice('Error Catcher plugin loaded');
  }

  registerGlobalHandlers() {
    if (this.handlerRegistered) return;

    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message));
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(
        new Error(event.reason?.message || 'Unhandled Promise Rejection')
      );
    });

    this.handlerRegistered = true;
  }

  captureError(error: Error) {
    if (!this.settings.enabled) return;

    const errorData = {
      id: 'err-' + Date.now(),
      timestamp: Date.now(),
      errorType: error.name,
      message: error.message,
      stackTrace: error.stack || '',
      notePath: this.app.workspace.getActiveFile()?.path || 'unknown',
      context: {
        source: 'obsidian-plugin',
        platform: this.getPlatform()
      }
    };

    this.sendError(errorData);

    if (this.settings.verbose) {
      new Notice(`Error captured: ${error.name}`);
    }
  }

  async sendError(errorData: any) {
    try {
      const response = await fetch(`${this.settings.serverUrl}/api/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      });

      if (response.ok && this.settings.verbose) {
        new Notice('Error transmitted to server');
      }
    } catch (error) {
      // Queue in localStorage for retry
      this.queueError(errorData);
    }
  }

  getPlatform(): string {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

**Dataviewjs Integration**:
```javascript
// In note - simplified usage
module.exports = (dv) => {
  if (window.errorCatcherAPI) {
    dv.paragraph('Error Catcher: Plugin active');
    // Optional: Manual error capture
    return {
      capture: window.errorCatcherAPI.capture,
      config: window.errorCatcherAPI.config
    };
  } else {
    dv.paragraph('Error: Obsidian Error Catcher plugin not installed');
  }
};
```

#### Path C: Inline Script Injection (Hybrid Approach)

**When to Use**: Plugin is too complex but template scope is limited

**Milestone 2.5: Inline Script Implementation**

**Tasks**:
1. Create template that injects `<script>` tag
2. Script registers global handlers
3. Use `postMessage` for communication

**Template**:
```javascript
module.exports = (dv) => {
  // Check if already installed
  if (window.obsidianErrorCatcherInstalled) {
    dv.paragraph('Error Catcher: Already active');
    return { status: 'already-installed' };
  }

  // Create script element
  const script = document.createElement('script');
  script.id = 'obsidian-error-catcher-script';
  script.textContent = `
    (function() {
      if (window.obsidianErrorCatcherInstalled) return;
      window.obsidianErrorCatcherInstalled = true;

      const config = {
        serverUrl: 'http://127.0.0.1:4321',
        enabled: true
      };

      function captureError(error) {
        const errorData = {
          id: 'err-' + Date.now(),
          timestamp: Date.now(),
          errorType: error.name || 'Error',
          message: error.message || 'Unknown error',
          stackTrace: error.stack || '',
          source: 'dataviewjs-inline'
        };

        fetch(config.serverUrl + '/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorData)
        }).catch(() => {
          console.error('[ErrorCatcher] Failed to send error');
        });
      }

      window.addEventListener('error', (e) => {
        captureError(e.error || new Error(e.message));
      });

      window.addEventListener('unhandledrejection', (e) => {
        captureError(new Error(e.reason?.message || 'Unhandled rejection'));
      });

      console.log('[ErrorCatcher] Installed via inline script');
    })();
  `;

  // Inject script
  document.head.appendChild(script);

  // Show status
  dv.el('div', 'Error Catcher: Installed (inline script)', {
    attr: {
      style: 'color: var(--text-success); font-size: 0.85em; padding: 4px 8px;'
    }
  });

  return { status: 'installed', method: 'inline-script' };
};
```

### Phase 3: Testing and Validation

**Priority**: High
**Dependencies**: Phase 2 completion

#### Milestone 3.1: Desktop Testing

**Tasks**:
1. Test on Obsidian Desktop (Windows/macOS/Linux)
2. Verify error capture from Dataviewjs blocks
3. Verify error capture from inline scripts
4. Verify visual feedback
5. Verify server transmission

**Test Matrix**:
| Platform | Error Source | Capture Works | Transmission Works |
|----------|--------------|---------------|-------------------|
| Windows | Dataviewjs block | [ ] | [ ] |
| macOS | Dataviewjs block | [ ] | [ ] |
| Linux | Dataviewjs block | [ ] | [ ] |
| Windows | Inline script | [ ] | [ ] |
| macOS | Inline script | [ ] | [ ] |
| Linux | Inline script | [ ] | [ ] |

#### Milestone 3.2: Mobile Testing

**Tasks**:
1. Test on Obsidian Mobile (iOS)
2. Test on Obsidian Mobile (Android)
3. Verify platform detection
4. Verify error capture (without DevTools)
5. Verify offline queue functionality

**Mobile Test Strategy**:
- Create test note with intentional errors
- Check server logs for received errors
- Verify visual feedback in note
- Test offline queue by stopping server

#### Milestone 3.3: Edge Cases

**Tasks**:
1. Test with server offline
2. Test with network latency
3. Test concurrent errors
4. Test queue overflow handling
5. Test special characters in error messages

### Phase 4: Documentation and Deployment

**Priority**: Medium
**Dependencies**: Phase 3 completion

#### Milestone 4.1: Documentation Updates

**Tasks**:
1. Update README with troubleshooting steps
2. Add mobile-specific instructions
3. Document known limitations
4. Create migration guide from old approach
5. Add FAQ section

#### Milestone 4.2: Deployment

**Tasks**:
1. Package template files
2. Create installation script
3. Verify compatibility with existing templates
4. Tag release version
5. Create CHANGELOG entry

---

## 3. Technical Approach

### 3.1 Architecture Decision Records

**ADR-001: Template vs Plugin vs Inline**

| Option | Pros | Cons | Decision |
|--------|------|-------|----------|
| Template Fix | Simple, single file | May not solve scope issues | Primary path |
| Plugin | Guaranteed global scope | Complex, requires installation | Fallback path |
| Inline Script | Works with template | Less elegant | Hybrid path |

**Decision**: Start with Template Fix, fall back to Plugin if needed

### 3.2 Code Quality Standards

**Requirements**:
- Pure JavaScript (no TypeScript)
- ES2022 compatibility
- No eval() or dynamic code execution
- CSP compliant
- Accessible markup

**Linting**:
```bash
# Run ESLint
eslint dataviewjs-templates/error-catcher.js

# Check for TypeScript syntax
grep -n " as " dataviewjs-templates/error-catcher.js

# Check for eval
grep -n "eval(" dataviewjs-templates/error-catcher.js
```

### 3.3 Error Handling Strategy

**Principles**:
1. Never throw from template
2. Log all errors to console (verbose mode)
3. Show user-friendly messages
4. Graceful degradation

**Implementation**:
```javascript
function safeExecute(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    Logger.error('Safe execution failed:', e);
    return fallback;
  }
}
```

---

## 4. Risk Management

### 4.1 Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Dataviewjs execution context is fully isolated | Medium | High | Implement plugin fallback |
| Mobile testing reveals platform-specific issues | High | Medium | Add platform-specific workarounds |
| TypeScript syntax causes silent failures | Low | High | Comprehensive syntax scan |
| Local server API changes break compatibility | Low | Medium | Version checking in template |

### 4.2 Mitigation Strategies

**Strategy 1: Early Validation**
- Run Phase 1 tests before full implementation
- Fail fast if fundamental issues found

**Strategy 2: Multiple Fallbacks**
- Template → Plugin → Inline Script
- Choose based on validation results

**Strategy 3: Progressive Enhancement**
- Start with minimal working version
- Add features incrementally

---

## 5. Resource Requirements

### 5.1 Development Environment

**Required**:
- Obsidian Desktop 1.5.0+
- Dataview Plugin 0.5.67+
- Local server running on port 4321
- Node.js 20+ (for plugin development, if needed)
- TypeScript 5+ (for plugin development, if needed)

**Optional**:
- iOS device for mobile testing
- Android device for mobile testing
- Obsidian Mobile installed

### 5.2 Testing Environment

**Required**:
- Desktop Obsidian for testing
- Local server for error reception
- Browser DevTools for debugging

**Optional**:
- iOS Simulator
- Android Emulator

---

## 6. Timeline and Priorities

### 6.1 Execution Order

```
Priority 1 (Critical - Do First):
├── Phase 1: Root Cause Validation
│   ├── Milestone 1.1: Basic Output
│   ├── Milestone 1.2: Global Handlers
│   ├── Milestone 1.3: Error Capture
│   └── Milestone 1.4: Server Transmission
│
Priority 2 (High - Do After Validation):
├── Phase 2: Fix Implementation
│   ├── Path A: Template Fix (if validation succeeds)
│   └── Path B: Plugin (if validation fails)
│
Priority 3 (Medium - Do After Fix):
├── Phase 3: Testing and Validation
│   ├── Milestone 3.1: Desktop Testing
│   ├── Milestone 3.2: Mobile Testing
│   └── Milestone 3.3: Edge Cases
│
Priority 4 (Low - Do Last):
└── Phase 4: Documentation and Deployment
    ├── Milestone 4.1: Documentation
    └── Milestone 4.2: Deployment
```

### 6.2 Dependencies

```
Phase 1 (Validation)
    ↓ (determines path)
Phase 2 (Implementation)
    ↓
Phase 3 (Testing)
    ↓
Phase 4 (Documentation)
```

---

## 7. Success Metrics

### 7.1 Completion Criteria

**Phase 1 Complete**:
- [ ] All 4 validation tests executed
- [ ] Root cause identified
- [ ] Implementation path determined

**Phase 2 Complete**:
- [ ] Chosen path implemented
- [ ] Syntax errors eliminated
- [ ] Code review passed

**Phase 3 Complete**:
- [ ] Desktop tests pass
- [ ] Mobile tests pass (if devices available)
- [ ] Edge cases handled

**Phase 4 Complete**:
- [ ] Documentation updated
- [ ] Deployment package ready
- [ ] Release tagged

### 7.2 Quality Gates

**Gate 1: Validation**
- Root cause must be identified
- Implementation path must be clear

**Gate 2: Implementation**
- No TypeScript syntax in JavaScript files
- All console.log replaced with Logger
- Error handlers tested

**Gate 3: Testing**
- Desktop platforms tested
- Server transmission verified
- At least one mobile platform tested (if available)

**Gate 4: Release**
- Documentation complete
- CHANGELOG updated
- Migration guide created

---

## 8. Rollback Strategy

### 8.1 Rollback Triggers

- Implementation introduces new issues
- Mobile testing reveals critical failures
- Performance degradation observed

### 8.2 Rollback Plan

1. Revert to previous working version
2. Document issues encountered
3. Create alternative implementation SPEC
4. Re-evaluate approach

---

**End of Implementation Plan**

**Next Steps**: Execute Phase 1 validation tests to determine implementation path.
