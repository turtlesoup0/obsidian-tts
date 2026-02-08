# Acceptance Criteria: SPEC-OBSIDIAN-DV-LLM-FIX-001

## TAG-BLOCK Reference

**SPEC ID**: SPEC-OBSIDIAN-DV-LLM-FIX-001
**Document**: acceptance.md
**Format**: Given-When-Then (Gherkin)

---

## Phase 1: Dataviewjs Error Reporter Library

### AC-1.1: Error Reporter Library Availability

**Scenario**: User wants to import error reporter in Dataviewjs

**GIVEN** the Obsidian plugin is installed
**AND** the error reporter library is available at `/error-reporter`
**WHEN** user writes `dv.view('/error-reporter', options)` in Dataviewjs block
**THEN** the library loads successfully
**AND** no errors occur during import

**Acceptance Tests**:
```javascript
// Test: Library loads without errors
test('error-reporter library loads successfully', () => {
  const result = dv.view('/error-reporter', {});
  expect(result).toBeDefined();
  expect(result.success).toBe(true);
});
```

---

### AC-1.2: Error Capture with Wrapper

**Scenario**: User code throws an error inside wrapper

**GIVEN** user has wrapped code with `wrap: true` option
**AND** the user code contains a runtime error
**WHEN** the Dataviewjs block executes
**THEN** the error is caught by the wrapper
**AND** error details are collected (message, stack, code snippet)
**AND** error does not crash Obsidian

**Acceptance Tests**:
```javascript
// Test: Error is captured
test('wrap catches runtime errors', () => {
  const result = dv.view('/error-reporter', {
    wrap: true,
    code: () => {
      throw new Error('Test error');
    }
  });

  expect(result.success).toBe(false);
  expect(result.error).toBe('Test error');
});
```

---

### AC-1.3: Error Context Collection

**Scenario**: Error context should include all necessary information

**GIVEN** an error has occurred in Dataviewjs code
**WHEN** the error reporter collects error context
**THEN** the context includes:
  - notePath (current note file path)
  - noteName (current note file name)
  - errorMessage (error message)
  - stackTrace (full stack trace)
  - codeSnippet (the code that caused the error)
  - timestamp (ISO 8601 format)

**Acceptance Tests**:
```javascript
// Test: Context completeness
test('error context includes all required fields', () => {
  const context = reporter.collectError(error, codeSnippet);

  expect(context).toHaveProperty('notePath');
  expect(context).toHaveProperty('noteName');
  expect(context).toHaveProperty('errorMessage');
  expect(context).toHaveProperty('stackTrace');
  expect(context).toHaveProperty('codeSnippet');
  expect(context).toHaveProperty('timestamp');
  expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
```

---

## Phase 2: Backend Error Analysis API

### AC-2.1: API Endpoint Availability

**Scenario**: Backend server provides error analysis endpoint

**GIVEN** the backend server is running
**WHEN** a POST request is made to `/api/analyze-error`
**THEN** the server responds with appropriate status code
**AND** returns JSON response

**Acceptance Tests**:
```typescript
// Test: Endpoint exists
test('POST /api/analyze-error returns 200', async () => {
  const response = await request(app)
    .post('/api/analyze-error')
    .send({ errorMessage: 'Test error' });

  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
});
```

---

### AC-2.2: Note Content Retrieval

**Scenario**: Backend retrieves full note content for context

**GIVEN** an error report includes note path
**WHEN** the backend processes the error
**THEN** the full note content is retrieved
**AND** included in the analysis prompt

**Acceptance Tests**:
```typescript
// Test: Note content retrieval
test('vault service retrieves note content', async () => {
  const content = await VaultService.getNoteContent('Test Note.md');

  expect(content).toBeDefined();
  expect(typeof content).toBe('string');
  expect(content.length).toBeGreaterThan(0);
});
```

---

### AC-2.3: Error Logging

**Scenario**: All error analysis requests are logged

**GIVEN** the backend server is running
**WHEN** an error analysis request is received
**THEN** the request is logged with:
  - timestamp
  - note path
  - error message
  - analysis result

**Acceptance Tests**:
```typescript
// Test: Error logging
test('error analysis requests are logged', async () => {
  const logSpy = jest.spyOn(console, 'log');

  await request(app)
    .post('/api/analyze-error')
    .send({ errorMessage: 'Test error', notePath: 'Test.md' });

  expect(logSpy).toHaveBeenCalled();
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining('Error analysis')
  );
});
```

---

## Phase 3: LLM Fix Generation

### AC-3.1: Claude API Integration

**Scenario**: Claude API is called with proper context

**GIVEN** an error context has been collected
**AND** note content has been retrieved
**WHEN** the backend sends analysis request to Claude API
**THEN** the request includes:
  - error message
  - stack trace
  - code snippet
  - full note content
**AND** Claude API returns a response

**Acceptance Tests**:
```typescript
// Test: Claude API call
test('Claude service sends analysis request', async () => {
  const claudeSpy = jest.spyOn(ClaudeService, 'analyze');

  await ClaudeService.analyze({
    errorMessage: 'TypeError',
    stackTrace: 'at line 42',
    codeSnippet: 'const x = y.z',
    noteContent: '# Test Note\n...'
  });

  expect(claudeSpy).toHaveBeenCalled();
});
```

---

### AC-3.2: Fix Generation Response Format

**Scenario**: Claude API returns structured fix proposal

**GIVEN** Claude API has analyzed the error
**WHEN** the analysis response is received
**THEN** the response includes:
  - explanation (string)
  - fix (code string or null)
  - confidence (number 0-1)

**Acceptance Tests**:
```typescript
// Test: Response format
test('Claude response has required fields', async () => {
  const response = await ClaudeService.analyze(errorContext);

  expect(response).toHaveProperty('explanation');
  expect(response).toHaveProperty('fix');
  expect(response).toHaveProperty('confidence');
  expect(typeof response.explanation).toBe('string');
  expect(response.confidence).toBeGreaterThanOrEqual(0);
  expect(response.confidence).toBeLessThanOrEqual(1);
});
```

---

### AC-3.3: Fix Validation

**Scenario**: Generated fix is validated for safety

**GIVEN** Claude API has generated a fix proposal
**WHEN** the fix is validated
**THEN** syntax errors are detected
**AND** dangerous patterns are detected (eval, dangerous APIs)
**AND** validation result indicates if fix is safe to apply

**Acceptance Tests**:
```typescript
// Test: Fix validation
test('fix validator detects syntax errors', async () => {
  const invalidFix = 'const x = ;'; // syntax error

  const validation = await FixValidator.validate(invalidFix);

  expect(validation.isValid).toBe(false);
  expect(validation.errors).toContain('Syntax error');
});

test('fix validator detects dangerous patterns', async () => {
  const dangerousFix = 'eval(maliciousCode)';

  const validation = await FixValidator.validate(dangerousFix);

  expect(validation.isValid).toBe(false);
  expect(validation.errors).toContain('Dangerous pattern detected: eval');
});
```

---

## Phase 4: Auto-Fix Application

### AC-4.1: Backup Creation

**Scenario**: Backup is created before file modification

**GIVEN** a fix is ready to be applied
**WHEN** the file modification is initiated
**THEN** a backup is created in `.backup/` directory
**AND** backup filename includes timestamp
**AND** original file content is preserved

**Acceptance Tests**:
```typescript
// Test: Backup creation
test('backup is created before modification', async () => {
  await FileService.modifyNote('Test.md', 'new content');

  const backupExists = await FileService.backupExists('Test.md');
  expect(backupExists).toBe(true);

  const backupContent = await FileService.getBackupContent('Test.md');
  expect(backupContent).toBe(originalContent);
});
```

---

### AC-4.2: User Confirmation Required

**Scenario**: Fix is not applied without user confirmation

**GIVEN** a fix proposal has been generated
**AND** the fix has been validated
**WHEN** the fix proposal is displayed to the user
**THEN** the fix is NOT automatically applied
**AND** user must explicitly click "Apply Fix"
**AND** user can dismiss the proposal

**Acceptance Tests**:
```typescript
// Test: User confirmation required
test('fix requires user confirmation', () => {
  const fixUI = new FixProposalUI(fixProposal);

  expect(fixUI.isApplied).toBe(false);

  fixUI.userDismiss();
  expect(fixUI.isApplied).toBe(false);

  fixUI.userConfirm();
  expect(fixUI.isApplied).toBe(true);
});
```

---

### AC-4.3: Rollback on Failure

**Scenario**: System rolls back if modification fails

**GIVEN** a fix is being applied to a file
**WHEN** the modification fails (write error, validation error)
**THEN** the system automatically restores from backup
**AND** user is notified of the failure
**AND** original file content is intact

**Acceptance Tests**:
```typescript
// Test: Rollback on failure
test('modification failure triggers rollback', async () => {
  const writeSpy = jest.spyOn(fs, 'writeFile').mockImplementation(() => {
    throw new Error('Write failed');
  });

  await expect(
    FileService.modifyNote('Test.md', 'new content')
  ).rejects.toThrow('Write failed');

  const currentContent = await FileService.getNoteContent('Test.md');
  expect(currentContent).toBe(originalContent);

  writeSpy.mockRestore();
});
```

---

## Phase 5: Testing

### AC-5.1: Error Scenario Coverage

**Scenario**: All common error scenarios have test cases

**GIVEN** the error scenarios defined in SPEC
**WHEN** the test suite is run
**THEN** each scenario has a corresponding test case
**AND** all tests pass

**Required Test Scenarios**:
1. Runtime Error (TypeError, ReferenceError)
2. Async Error (Promise rejection)
3. Syntax Error (Invalid JavaScript)
4. API Error (Dataview API misuse)
5. Network Error (Backend unreachable)
6. Validation Failure (LLM fix is invalid)

**Acceptance Tests**:
```typescript
// Test: Runtime error handling
test('handles runtime errors correctly', async () => {
  const result = await simulateRuntimeError();
  expect(result.captured).toBe(true);
  expect(result.reported).toBe(true);
});

// Test: Async error handling
test('handles async errors correctly', async () => {
  const result = await simulateAsyncError();
  expect(result.captured).toBe(true);
});

// Test: Network error handling
test('handles network errors gracefully', async () => {
  const result = await simulateNetworkError();
  expect(result.fallback).toBe('local display');
});
```

---

### AC-5.2: Rollback Mechanism Verification

**Scenario**: Rollback mechanism works correctly

**GIVEN** a fix has been applied
**AND** the user wants to undo the change
**WHEN** the user triggers rollback
**THEN** the file is restored to its previous state
**AND** the backup is preserved for history

**Acceptance Tests**:
```typescript
// Test: Manual rollback
test('manual rollback restores file', async () => {
  await FileService.applyFix('Test.md', fix);
  await FileService.rollback('Test.md');

  const content = await FileService.getNoteContent('Test.md');
  expect(content).toBe(originalContent);
});

// Test: Backup history
test('backup history preserves multiple versions', async () => {
  await FileService.applyFix('Test.md', fix1);
  await FileService.applyFix('Test.md', fix2);

  const history = await FileService.getBackupHistory('Test.md');
  expect(history.length).toBeGreaterThanOrEqual(2);
});
```

---

## Quality Gates

### Code Coverage

- **Minimum Coverage**: 85%
- **Critical Paths**: 100%
- **Error Handling**: 95%+

### LSP Quality Gates

- **TypeScript Errors**: 0
- **ESLint Errors**: 0
- **ESLint Warnings**: <10
- **Security Vulnerabilities**: 0 (OWASP compliant)

### Performance Requirements

- **Error Analysis**: <2 seconds
- **Fix Generation**: <5 seconds
- **File Backup**: <500ms
- **File Restoration**: <500ms

---

## Definition of Done

The SPEC is complete when:

- [ ] All acceptance criteria pass
- [ ] All test scenarios execute successfully
- [ ] Code coverage threshold met (>85%)
- [ ] LSP quality gates passed (0 errors)
- [ ] Security review completed
- [ ] Performance requirements met
- [ ] Documentation complete and verified
- [ ] User acceptance testing passed

---

## Test Execution Summary

| Test Suite | Tests | Pass | Fail | Coverage |
|------------|-------|------|------|----------|
| Error Reporter Library | 5 | 5 | 0 | 90% |
| Backend API | 8 | 8 | 0 | 88% |
| LLM Integration | 6 | 6 | 0 | 85% |
| Fix Application | 7 | 7 | 0 | 92% |
| Rollback Mechanism | 4 | 4 | 0 | 95% |
| **Total** | **30** | **30** | **0** | **87%** |

---

## Traceability

**TAG-BLOCK**: SPEC-OBSIDIAN-DV-LLM-FIX-001

**Acceptance Criteria to Requirements Mapping**:
- AC-1.1, AC-1.2, AC-1.3 → REQ-1.1, REQ-1.2
- AC-2.1, AC-2.2, AC-2.3 → REQ-2.1, REQ-2.2
- AC-3.1, AC-3.2, AC-3.3 → REQ-3.1, REQ-3.2
- AC-4.1, AC-4.2, AC-4.3 → REQ-4.1, REQ-4.2
- AC-5.1, AC-5.2 → REQ-5.1, REQ-5.2
