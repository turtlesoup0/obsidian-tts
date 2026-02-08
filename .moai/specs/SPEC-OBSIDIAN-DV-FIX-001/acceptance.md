# SPEC-OBSIDIAN-DV-FIX-001: Acceptance Criteria

**SPEC ID**: SPEC-OBSIDIAN-DV-FIX-001
**Related SPECs**: spec.md, plan.md
**Status**: Planned
**Last Updated**: 2026-02-04

---

## 1. Acceptance Criteria Overview

### 1.1 Definition of Done

A implementation is considered complete when:
1. All Phase 1 validation tests have been executed and documented
2. Root cause has been identified with supporting evidence
3. Fix has been implemented based on validation results
4. All functional acceptance tests pass
5. At least one desktop platform and one mobile platform verified
6. Documentation updated with troubleshooting steps

### 1.2 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template Load Success Rate | 100% | Template loads without errors |
| Error Capture Rate | 95%+ | Captured errors / total errors |
| Server Transmission Success | 90%+ | Successful sends / total attempts |
| Visual Feedback Display | 100% | Status visible in note |
| Mobile Compatibility | 100% | Works on iOS and Android |

---

## 2. Phase 1: Validation Acceptance Criteria

### 2.1 Basic Output Visibility

**Scenario 1.1: Paragraph Output Visibility**

```
GIVEN a note in Obsidian Reading Mode
AND the note contains a dataviewjs block
AND the block calls dv.view('/dataviewjs-templates/test-1-basic-output')
WHEN the note is rendered
THEN the text "PARAGRAPH_TEST" MUST be visible in the note
AND the text MUST be plain text (not HTML source)
```

**Acceptance Tests**:
- [ ] Desktop: Paragraph text visible in Reading Mode
- [ ] Desktop: Paragraph text visible in Live Preview
- [ ] Mobile: Paragraph text visible in Reading Mode

**Evidence Required**: Screenshot or documented observation

---

**Scenario 1.2: Element Output Visibility**

```
GIVEN a note in Obsidian Reading Mode
AND the note contains a dataviewjs block
AND the block calls dv.view() with dv.el() usage
WHEN the note is rendered
THEN the element MUST be visible in the note
AND the element MUST render as HTML
```

**Acceptance Tests**:
- [ ] Desktop: Element visible with correct styling
- [ ] Desktop: Element renders HTML (not escaped)
- [ ] Mobile: Element visible with correct styling

**Evidence Required**: Screenshot or documented observation

---

**Scenario 1.3: Console Output Visibility**

```
GIVEN a note in Obsidian
AND the note contains a dataviewjs block with console.log()
WHEN the note is rendered
AND DevTools Console is open
THEN the console output MUST be visible
```

**Acceptance Tests**:
- [ ] Desktop: Console output appears in DevTools
- [ ] Desktop: Console output includes expected text
- [ ] Mobile: Console output accessible (if possible)

**Evidence Required**: Console screenshot or log capture

---

### 2.2 Global Handler Registration

**Scenario 2.1: Handler Registration Success**

```
GIVEN a template that registers a global event handler
AND the template is loaded via dv.view()
WHEN the template executes
THEN the event handler MUST be registered on window object
AND the handler MUST be callable
```

**Acceptance Tests**:
- [ ] Handler function exists on window
- [ ] Handler can be invoked manually
- [ ] Handler receives events when dispatched

**Evidence Required**: Console logs showing handler invocation

---

**Scenario 2.2: Cross-Context Handler Invocation**

```
GIVEN a global event handler registered in template
AND a separate dataviewjs block in the same note
WHEN the separate block dispatches the event
THEN the handler MUST receive the event
AND the handler MUST execute its callback
```

**Acceptance Tests**:
- [ ] Handler receives events from same template
- [ ] Handler receives events from different templates
- [ ] Handler receives events from inline scripts

**Evidence Required**: Console logs showing cross-context invocation

---

**Scenario 2.3: Handler Persistence**

```
GIVEN a global event handler registered in template
WHEN the user navigates to a different note
AND then returns to the original note
THEN the handler MUST still be registered
OR the template MUST re-register the handler
```

**Acceptance Tests**:
- [ ] Handler persists after note navigation
- [ ] OR template re-registers on reload
- [ ] No duplicate handlers registered

**Evidence Required**: Documented behavior

---

### 2.3 Error Capture

**Scenario 3.1: Synchronous Error Capture**

```
GIVEN a template with global error handler registered
AND a JavaScript error thrown in same template
WHEN the error occurs
THEN the handler MUST capture the error
AND the handler MUST have access to error.stack
AND the handler MUST have access to error.message
```

**Acceptance Tests**:
- [ ] Error is captured by handler
- [ ] Error.stack is available
- [ ] Error.message is available
- [ ] Error.type is available

**Evidence Required**: Console logs showing captured error details

---

**Scenario 3.2: Asynchronous Error Capture**

```
GIVEN a template with global error handler registered
AND a JavaScript error thrown in setTimeout callback
WHEN the callback executes and throws error
THEN the handler MUST capture the error
```

**Acceptance Tests**:
- [ ] Async errors are captured
- [ ] Error context includes stack trace
- [ ] Handler can distinguish async from sync errors

**Evidence Required**: Console logs showing async error capture

---

**Scenario 3.3: Promise Rejection Capture**

```
GIVEN a template with unhandledrejection handler registered
AND a Promise that rejects without catch handler
WHEN the Promise rejects
THEN the unhandledrejection handler MUST capture the rejection
AND the handler MUST have access to rejection reason
```

**Acceptance Tests**:
- [ ] Promise rejections are captured
- [ ] Rejection reason is available
- [ ] Handler can prevent default browser behavior

**Evidence Required**: Console logs showing rejection capture

---

### 2.4 Server Transmission

**Scenario 4.1: Successful Error Transmission**

```
GIVEN a local server running on http://127.0.0.1:4321
AND a template that sends error data via fetch()
WHEN the error data is sent
THEN the server MUST receive the POST request
AND the server MUST respond with success status
AND the template MUST log success message
```

**Acceptance Tests**:
- [ ] Server receives POST request
- [ ] Request body contains valid JSON
- [ ] Server responds with 200-299 status
- [ ] Template logs success (if verbose mode)

**Evidence Required**: Server logs showing received error data

---

**Scenario 4.2: Offline Queue Behavior**

```
GIVEN a template with offline queue functionality
AND the local server is NOT running
WHEN an error is captured
THEN the error MUST be stored in localStorage
AND the queue MUST be accessible for retry
```

**Acceptance Tests**:
- [ ] Error stored in localStorage
- [ ] Queue is retrievable
- [ ] Queue length increases by 1
- [ ] Stored error contains all required fields

**Evidence Required**: localStorage inspection or queue read function

---

**Scenario 4.3: Queue Retry on Reconnect**

```
GIVEN queued errors in localStorage
AND the local server starts running
WHEN a new template loads
THEN the template MUST read queued errors
AND the template MUST attempt to send each queued error
AND successfully sent errors MUST be removed from queue
```

**Acceptance Tests**:
- [ ] Queued errors are read on load
- [ ] Each error is sent to server
- [ ] Successfully sent errors are dequeued
- [ ] Failed sends remain in queue

**Evidence Required**: Server logs and queue state inspection

---

## 3. Phase 2: Implementation Acceptance Criteria

### 3.1 Syntax Correctness

**Scenario 5.1: No TypeScript Syntax**

```
GIVEN the error-catcher.js template file
WHEN the file is parsed as JavaScript
THEN the file MUST NOT contain TypeScript-specific syntax
AND "as any" type assertions MUST NOT be present
AND type annotations MUST NOT be present
```

**Acceptance Tests**:
- [ ] No " as " type assertions found
- [ ] No ": Type" annotations found
- [ ] No interface declarations
- [ ] No generic type parameters <T>

**Evidence Required**: Grep search results showing no TypeScript syntax

---

**Scenario 5.2: ES2022 Compatibility**

```
GIVEN the error-catcher.js template file
WHEN the file is executed in ES2022 environment
THEN all syntax MUST be valid ES2022
AND modern features MUST have fallbacks for older environments
```

**Acceptance Tests**:
- [ ] Optional chaining has fallback
- [ ] Nullish coalescing has fallback
- [ ] No ES2023+ specific features without fallback

**Evidence Required**: Code review

---

### 3.2 Visual Feedback

**Scenario 6.1: Status Display in Note**

```
GIVEN a note with error catcher template loaded
AND verbose mode is disabled (default)
WHEN the note is rendered
THEN a status indicator MUST be visible
AND the status MUST show "Error Catcher: [note-name] ([platform])"
AND the status MUST have subtle styling
```

**Acceptance Tests**:
- [ ] Status element is visible
- [ ] Status text includes note name
- [ ] Status text includes platform (desktop/ios/android)
- [ ] Status styling is non-intrusive

**Evidence Required**: Screenshot of rendered note

---

**Scenario 6.2: Verbose Mode Feedback**

```
GIVEN a note with error catcher template loaded
AND verbose mode is enabled: { verbose: true }
WHEN the note is rendered
THEN additional status information MUST be displayed
AND console logs MUST show initialization details
```

**Acceptance Tests**:
- [ ] Detailed status is visible in note
- [ ] Console shows initialization logs
- [ ] Console shows configuration details
- [ ] Console shows handler registration status

**Evidence Required**: Console logs and screenshot

---

### 3.3 Error Handler Registration

**Scenario 7.1: Handler Registration Confirmation**

```
GIVEN the error catcher template loaded
AND autoCapture is enabled (default)
WHEN the template initializes
THEN global error handlers MUST be registered
AND registration MUST be confirmed via log or status
```

**Acceptance Tests**:
- [ ] window.error handler is registered
- [ ] unhandledrejection handler is registered
- [ ] Registration status is logged (if verbose)
- [ ] Status shows handlers are active

**Evidence Required**: Console logs and status display

---

**Scenario 7.2: Manual Handler Control**

```
GIVEN the error catcher template loaded
AND autoCapture is disabled: { autoCapture: false }
WHEN the template initializes
THEN global error handlers MUST NOT be registered
AND manual capture function MUST be available
```

**Acceptance Tests**:
- [ ] No automatic handler registration
- [ ] Returned object includes captureError function
- [ ] Manual capture function works
- [ ] Status shows "Manual mode"

**Evidence Required**: Template return value and status display

---

## 4. Phase 3: Integration Acceptance Criteria

### 4.1 End-to-End Error Flow

**Scenario 8.1: Complete Error Capture Flow**

```
GIVEN a note with error catcher template
AND a JavaScript error occurs in a dataviewjs block
WHEN the error is thrown
THEN the error is captured by global handler
AND error data is transmitted to server
AND server stores error in database
```

**Acceptance Tests**:
- [ ] Error captured with full details
- [ ] Error transmitted successfully
- [ ] Server database contains error record
- [ ] Error record has all required fields

**Evidence Required**:
1. Template console logs
2. Server access logs
3. Database query result

---

**Scenario 8.2: Cross-Note Error Capture**

```
GIVEN error catcher loaded in Note A
AND a JavaScript error occurs in Note B
WHEN the error is thrown
THEN the error MAY be captured (depending on implementation)
AND the captured error MUST have correct notePath
```

**Acceptance Tests**:
- [ ] If plugin-based: Error captured with correct notePath
- [ ] If template-based: Error not captured (acceptable)
- [ ] Behavior is documented

**Evidence Required**: Test results and documentation

---

### 4.2 Multi-Platform Compatibility

**Scenario 9.1: Desktop Platform**

```
GIVEN Obsidian Desktop on Windows/macOS/Linux
AND error catcher template loaded
WHEN JavaScript error occurs
THEN error is captured and transmitted
```

**Acceptance Tests**:
- [ ] Windows: Error capture works
- [ ] macOS: Error capture works
- [ ] Linux: Error capture works

**Evidence Required**: Test results for each platform

---

**Scenario 9.2: Mobile Platform**

```
GIVEN Obsidian Mobile on iOS or Android
AND error catcher template loaded
WHEN JavaScript error occurs
THEN error is captured and transmitted
AND platform detection shows correct platform
```

**Acceptance Tests**:
- [ ] iOS: Error capture works
- [ ] Android: Error capture works
- [ ] Platform detection accurate
- [ ] Visual feedback shown (no DevTools available)

**Evidence Required**:
1. Server logs showing mobile errors
2. Screenshot of mobile note showing status
3. Platform detection in error records

---

### 4.3 Edge Cases

**Scenario 10.1: Server Offline**

```
GIVEN error catcher template loaded
AND local server is NOT running
WHEN JavaScript error occurs
THEN error is queued in localStorage
AND appropriate message is logged
```

**Acceptance Tests**:
- [ ] Error stored in queue
- [ ] Queue persists across page reloads
- [ ] Warning message shown (if verbose)
- [ ] No errors thrown by template

**Evidence Required**:
1. localStorage inspection
2. Console logs

---

**Scenario 10.2: Concurrent Errors**

```
GIVEN error catcher template loaded
AND multiple errors occur simultaneously
WHEN errors are captured
THEN all errors are captured
AND all errors are transmitted
AND no errors are lost
```

**Acceptance Tests**:
- [ ] All concurrent errors captured
- [ ] All transmitted to server
- [ ] Transmission order is maintained
- [ ] No race conditions in queue

**Evidence Required**: Server logs and queue inspection

---

**Scenario 10.3: Special Characters in Errors**

```
GIVEN error catcher template loaded
AND error message contains special characters (quotes, backslashes, unicode)
WHEN error is captured and transmitted
THEN error is correctly transmitted
AND special characters are preserved or escaped
```

**Acceptance Tests**:
- [ ] Quotes handled correctly
- [ ] Backslashes handled correctly
- [ ] Unicode characters preserved
- [ ] No JSON parsing errors

**Evidence Required**: Server logs showing correctly formatted error data

---

## 5. Phase 4: Documentation Acceptance Criteria

### 5.1 User Documentation

**Scenario 11.1: Installation Instructions**

```
GIVEN a user wants to install error catcher
WHEN they read the README
THEN they MUST be able to install with no prior knowledge
AND installation steps MUST be clear and numbered
```

**Acceptance Tests**:
- [ ] Installation steps are clear
- [ ] File locations are specified
- [ ] Prerequisites are listed
- [ ] Common issues are addressed

**Evidence Required**: README.md review

---

**Scenario 11.2: Usage Examples**

```
GIVEN a user wants to use error catcher
WHEN they read the README
THEN they MUST find clear usage examples
AND examples MUST cover common use cases
```

**Acceptance Tests**:
- [ ] Basic usage example provided
- [ ] Custom configuration example provided
- [ ] Manual capture example provided
- [ ] Mobile-specific notes included

**Evidence Required**: README.md contains usage section

---

### 5.2 Troubleshooting Guide

**Scenario 12.1: Common Issues**

```
GIVEN a user encounters an issue
WHEN they check the troubleshooting section
THEN they MUST find solutions for common problems
```

**Acceptance Tests**:
- [ ] "No visible output" issue covered
- [ ] "Errors not captured" issue covered
- [ ] "Server connection failed" issue covered
- [ ] "Mobile not working" issue covered

**Evidence Required**: README.md contains troubleshooting section

---

## 6. Non-Functional Acceptance Criteria

### 6.1 Performance

**Scenario 13.1: Template Load Time**

```
GIVEN a note with error catcher template
WHEN the note is opened
THEN the template MUST load within 500ms
AND visual feedback MUST appear within 1 second
```

**Acceptance Tests**:
- [ ] Template load time < 500ms (measured)
- [ ] Status display appears < 1s (measured)
- [ ] No perceptible lag in note rendering

**Evidence Required**: Performance measurements

---

**Scenario 13.2: Error Capture Latency**

```
GIVEN an error catcher is active
WHEN a JavaScript error occurs
THEN the error MUST be captured within 100ms
AND transmission MUST start within 200ms
```

**Acceptance Tests**:
- [ ] Capture latency < 100ms (measured)
- [ ] Transmission starts < 200ms (measured)
- [ ] No UI blocking during capture

**Evidence Required**: Performance measurements

---

### 6.2 Security

**Scenario 14.1: Data Privacy**

```
GIVEN an error is captured
WHEN error data is transmitted
THEN data MUST only go to localhost
AND no external requests are made
```

**Acceptance Tests**:
- [ ] All requests to 127.0.0.1 or localhost
- [ ] No requests to external domains
- [ ] Network monitoring confirms local-only traffic

**Evidence Required**: Network inspection logs

---

**Scenario 14.2: Sensitive Data Masking**

```
GIVEN an error containing sensitive information
WHEN error is captured
THEN sensitive data MUST be masked
AND masked data MUST be transmitted
```

**Acceptance Tests**:
- [ ] Passwords masked: "***MASKED***"
- [ ] API keys masked: "***MASKED***"
- [ ] Tokens masked: "***MASKED***"
- [ ] Emails masked: "***@***.***"

**Evidence Required**: Server logs showing masked data

---

## 7. Regression Prevention

### 7.1 Backward Compatibility

**Scenario 15.1: Server API Compatibility**

```
GIVEN the existing local server API
WHEN the new error catcher is used
THEN the server MUST accept the error data
AND the server MUST respond correctly
```

**Acceptance Tests**:
- [ ] POST /api/errors accepts new format
- [ ] Response format is unchanged
- [ ] Database schema is compatible

**Evidence Required**: Server logs and database inspection

---

### 7.2 Behavior Preservation

**Scenario 15.2: Existing Functionality**

```
GIVEN existing error logging system
WHEN new error catcher is added
THEN existing functionality MUST NOT be broken
```

**Acceptance Tests**:
- [ ] Existing templates still work
- [ ] Existing API endpoints still work
- [ ] No breaking changes to server

**Evidence Required**: Integration test results

---

## 8. Sign-Off Criteria

### 8.1 Developer Sign-Off

**Checklist**:
- [ ] All Phase 1 validation tests executed
- [ ] Root cause identified and documented
- [ ] Implementation completed based on validation
- [ ] All functional tests pass
- [ ] Code review completed
- [ ] No TypeScript syntax in JavaScript files
- [ ] No console.log without conditional

### 8.2 QA Sign-Off

**Checklist**:
- [ ] Desktop testing completed (at least one platform)
- [ ] Mobile testing completed (at least one platform, if available)
- [ ] Edge cases tested
- [ ] Documentation reviewed
- [ ] Known limitations documented

### 8.3 User Acceptance

**Checklist**:
- [ ] Can install without issues
- [ ] Can use without DevTools
- [ ] Errors are captured correctly
- [ ] Visual feedback is clear
- [ ] Troubleshooting guide is helpful

---

## 9. Test Execution Summary

### 9.1 Test Matrix

| Test ID | Scenario | Desktop | iOS | Android | Status |
|---------|----------|---------|-----|---------|--------|
| 1.1 | Paragraph Output | [ ] | [ ] | [ ] | Pending |
| 1.2 | Element Output | [ ] | [ ] | [ ] | Pending |
| 1.3 | Console Output | [ ] | N/A | N/A | Pending |
| 2.1 | Handler Registration | [ ] | [ ] | [ ] | Pending |
| 2.2 | Cross-Context | [ ] | [ ] | [ ] | Pending |
| 2.3 | Handler Persistence | [ ] | [ ] | [ ] | Pending |
| 3.1 | Sync Error Capture | [ ] | [ ] | [ ] | Pending |
| 3.2 | Async Error Capture | [ ] | [ ] | [ ] | Pending |
| 3.3 | Promise Rejection | [ ] | [ ] | [ ] | Pending |
| 4.1 | Server Transmission | [ ] | [ ] | [ ] | Pending |
| 4.2 | Offline Queue | [ ] | [ ] | [ ] | Pending |
| 4.3 | Queue Retry | [ ] | [ ] | [ ] | Pending |

### 9.2 Execution Notes

**Date**: _________
**Tester**: _________
**Environment**: _________

**Notes**:
- _________________________________________________________________________
- _________________________________________________________________________
- _________________________________________________________________________

---

**End of Acceptance Criteria**

**Next Steps**: Execute Phase 1 validation tests and document results.
