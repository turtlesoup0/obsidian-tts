# Acceptance Criteria: SPEC-OBSIDIAN-TTSV5-SYNC-002

## Traceability TAGS

```
#spec #obsidian #tts #synchronization #race-condition #timestamp #index-matching #v5.4.0
#acceptance-criteria #test-scenarios #gherkin
```

---

## Overview

This document defines detailed acceptance criteria for TTS v5 position synchronization fixes. All test scenarios follow the Given-When-Then (Gherkin) format.

---

## R1: Index vs Title Matching Consistency

### AC1.1: Index-First Position Restoration

**GIVEN**: User has TTS Player Note and Integrated Note with different `currentPageNames` arrays
**WHEN**: TTS is playing at index 5 in TTS Player Note
**THEN**: Integrated Note should restore position to index 5 using index-based matching

**Acceptance**:
- [ ] Position restored to index 5 regardless of title differences
- [ ] Index bounds validation performed (0 <= 5 < currentPageNames.length)
- [ ] Success logged: "Matched by index [5]"

### AC1.2: Title-Based Confirmation

**GIVEN**: User has TTS Player Note and Integrated Note with same `currentPageNames` arrays
**WHEN**: TTS is playing at index 5
**THEN**: System should confirm match by both index and title

**Acceptance**:
- [ ] Position restored to index 5
- [ ] Title match confirmed: "Title match confirmed: '기술사_출제예상_제목'"
- [ ] Match result logged with confidence level

### AC1.3: Index Out of Bounds Handling

**GIVEN**: TTS Player Note has 10 items, Integrated Note has 5 items
**WHEN**: TTS is playing at index 7 in TTS Player Note
**THEN**: System should clamp to valid range (index 4)

**Acceptance**:
- [ ] Index validated against bounds: 7 >= 5 (clamped to 4)
- [ ] Position restored to index 4 (last valid index)
- [ ] Warning logged: "Index out of bounds, clamped to [4]"

### AC1.4: Fallback on Title Mismatch

**GIVEN**: Two notes have completely different `currentPageNames` arrays
**WHEN**: Title matching fails but index is valid
**THEN**: System should use raw index value

**Acceptance**:
- [ ] Title mismatch detected and logged
- [ ] Position restored using raw `lastPlayedIndex`
- [ ] Warning displayed: "Title mismatch, using index [5]"

---

## R2: Server Timestamp Validation

### AC2.1: Future Timestamp Detection

**GIVEN**: M4 Pro server returns timestamp 1 hour in future
**WHEN**: TTSAutoMoveManager polls position
**THEN**: System should detect future timestamp

**Acceptance**:
- [ ] Future timestamp detected: "Timestamp is 60 minutes in future"
- [ ] Detection logged with original timestamp
- [ ] Sync not rejected

### AC2.2: Automatic Timestamp Adjustment

**GIVEN**: M4 Pro server returns timestamp 10 minutes in future (exceeds 5min tolerance)
**WHEN**: playackPositionManager saves position
**THEN**: System should replace with client timestamp

**Acceptance**:
- [ ] Timestamp replaced with `Date.now()`
- [ ] Adjustment logged: "Timestamp adjusted from [future] to [now]"
- [ ] Position saved successfully
- [ ] Zero sync failures due to timestamp

### AC2.3: Configurable Tolerance Threshold

**GIVEN**: User configures tolerance to 10 minutes
**WHEN**: Server timestamp is 8 minutes in future
**THEN**: System should accept timestamp without adjustment

**Acceptance**:
- [ ] Timestamp within tolerance detected
- [ ] Original timestamp accepted
- [ ] No adjustment performed
- [ ] Logged: "Timestamp within tolerance, using original"

### AC2.4: Timestamp Adjustment Logging

**GIVEN**: Timestamp adjustment occurred
**WHEN**: User views sync history
**THEN**: All adjustments should be logged

**Acceptance**:
- [ ] Log entry contains original timestamp
- [ ] Log entry contains adjusted timestamp
- [ ] Log entry contains reason for adjustment
- [ ] Logs accessible via debug dashboard

---

## R3: Race Condition Prevention

### AC3.1: Manual Click Priority

**GIVEN**: Auto-move timer is polling (every 6 seconds)
**WHEN**: User clicks manual TTS position button during poll
**THEN**: Manual click should take priority

**Acceptance**:
- [ ] In-progress auto poll cancelled
- [ ] Manual click executed immediately
- [ ] Position updated based on manual click
- [ ] Priority logged: "Manual click (priority 1) cancelled auto poll (priority 2)"

### AC3.2: Debounce Scroll Operations

**GIVEN**: Multiple scroll events triggered within 300ms
**WHEN**: Position updates occur rapidly
**THEN**: Only last scroll operation should execute

**Acceptance**:
- [ ] First scroll operation queued
- [ ] Subsequent scrolls within 300ms debounced
- [ ] Only last scroll executed
- [ ] Debounce events logged

### AC3.3: Cancel-and-Restart Mechanism

**GIVEN**: Position sync operation in progress
**WHEN**: New higher-priority operation triggered
**THEN**: In-progress operation should be cancelled

**Acceptance**:
- [ ] In-progress operation detected
- [ ] Operation cancelled gracefully
- [ ] New operation started
- [ ] Cancellation logged with operation IDs

### AC3.4: StateLock Coverage

**GIVEN**: All position update paths active
**WHEN**: Concurrent updates attempted
**THEN**: StateLock should prevent all conflicts

**Acceptance**:
- [ ] All paths protected by StateLock:
  - [ ] playbackPositionManager.savePosition()
  - [ ] TTSAutoMoveManager.pollPosition()
  - [ ] Manual button click handlers
  - [ ] scrollPositionManager operations
- [ ] Zero race conditions in stress test (1000+ operations)
- [ ] All conflicts logged

---

## R4: Sync Status Visibility

### AC4.1: Status Indicator Component

**GIVEN**: User viewing Integrated Note
**WHEN**: Sync operation in progress
**THEN**: Status should display "Sync Status: Syncing..."

**Acceptance**:
- [ ] Status indicator visible in note header
- [ ] Animated spinner shown during sync
- [ ] Status text: "Sync Status: Syncing..."
- [ ] Status updates in real-time

### AC4.2: Last Sync Time Display

**GIVEN**: Sync operation completed successfully
**WHEN**: User views status component
**THEN**: Last sync time should be displayed

**Acceptance**:
- [ ] Last sync time shown in local timezone
- [ ] Format: "Last synced: 2026-02-04 14:30:25 KST"
- [ ] Updates after each successful sync
- [ ] Shows relative time for recent syncs ("2 minutes ago")

### AC4.3: Match Result Display

**GIVEN**: Position matching completed
**WHEN**: User views status component
**THEN**: Match method and result should be displayed

**Acceptance**:
- [ ] Match method shown: "Matched by index [5]"
- [ ] Title confirmation shown if available: "Title: '기술사_출제예상_제목'"
- [ ] Confidence level indicated (High/Medium/Low)
- [ ] Color-coded by confidence

### AC4.4: Timestamp Adjustment Warning

**GIVEN**: Timestamp was adjusted due to timezone issue
**WHEN**: User views status component
**THEN**: Warning should be displayed

**Acceptance**:
- [ ] Warning icon shown (yellow triangle)
- [ ] Warning text: "Timestamp adjusted from server time"
- [ ] Original timestamp shown in tooltip
- [ ] Adjustment reason explained

---

## Integration Test Scenarios

### ITS1: End-to-End Position Sync

**GIVEN**: User opens TTS Player Note on Desktop
**AND**: User opens Integrated Note on Tablet
**WHEN**: User plays TTS at index 5 on Desktop
**THEN**: Tablet should auto-scroll to index 5 within 10 seconds

**Acceptance**:
- [ ] Desktop saves position to server
- [ ] Tablet polls server and receives position
- [ ] Index matching succeeds (5 == 5)
- [ ] Auto-scroll executes
- [ ] Status updated to "Synced: Desktop -> Tablet"

### ITS2: Timezone Drift Recovery

**GIVEN**: M4 Pro server timezone drifts by +2 hours
**WHEN**: Any position sync occurs
**THEN**: System should adjust timestamp automatically

**Acceptance**:
- [ ] Future timestamp detected (+2 hours)
- [ ] Timestamp replaced with client time
- [ ] Sync completes successfully
- [ ] Warning logged but not shown to user (automatic recovery)

### ITS3: Concurrent Update Conflict

**GIVEN**: User clicks manual button at T=0
**AND**: Auto timer triggers at T=0.1s
**WHEN**: Both operations attempt to update position
**THEN**: Manual click should succeed, auto poll cancelled

**Acceptance**:
- [ ] Manual click acquires lock (priority 1)
- [ ] Auto poll cancelled (priority 2)
- [ ] Manual position applied
- [ ] Conflict logged
- [ ] User sees: "Position updated (manual)"

---

## Quality Gates

### Performance Criteria

- [ ] Position matching completes within 100ms
- [ ] Timestamp adjustment completes within 50ms
- [ ] StateLock acquisition completes within 200ms
- [ ] Status UI updates within 500ms of sync completion

### Reliability Criteria

- [ ] Zero sync failures due to timestamp issues
- [ ] Zero race conditions in 1000+ operation stress test
- [ ] 99.9% position matching success rate
- [ ] Zero data loss during cancellation

### Usability Criteria

- [ ] All status changes visible within 1 second
- [ ] Error messages clear and actionable
- [ ] Warnings non-intrusive (no modal dialogs)
- [ ] Debug mode available for troubleshooting

---

## Definition of Done

A requirement is considered complete when:

1. All acceptance criteria for the requirement pass
2. Unit tests written and passing (85%+ coverage)
3. Integration tests written and passing
4. Manual testing scenarios verified
5. Code review approved
6. Documentation updated
7. Zero critical bugs remaining
8. Performance benchmarks met

---

## Test Execution Checklist

### Pre-Test Setup

- [ ] Test environment configured (Azure Function API accessible)
- [ ] Test notes created with different `currentPageNames` arrays
- [ ] Server timezone simulation configured
- [ ] Debug logging enabled
- [ ] Baseline metrics recorded

### Test Execution

- [ ] Unit tests executed and passing
- [ ] Integration tests executed and passing
- [ ] Manual test scenarios executed
- [ ] Stress tests executed (1000+ operations)
- [ ] Performance benchmarks verified
- [ ] Race condition tests executed

### Post-Test Verification

- [ ] All acceptance criteria marked as passed
- [ ] Test results documented
- [ ] Bugs logged and tracked
- [ ] Performance metrics compared to baseline
- [ ] Code coverage verified (85%+)
