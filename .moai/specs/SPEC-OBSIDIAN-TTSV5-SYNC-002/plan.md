# Implementation Plan: SPEC-OBSIDIAN-TTSV5-SYNC-002

## Traceability TAGS

```
#spec #obsidian #tts #synchronization #race-condition #timestamp #index-matching #v5.4.0
#implementation-plan #milestones #technical-approach
```

---

## Milestones by Priority

### Primary Goal (Priority High)

**Milestone 1: Index-First Position Matching**
- Implement index-based position restoration as primary method
- Add index bounds validation
- Implement title matching as fallback/confirmation
- Add comprehensive logging for match results

**Milestone 2: Timestamp Adjustment**
- Implement future timestamp detection
- Add client timestamp replacement logic
- Add timestamp adjustment logging
- Implement configurable tolerance threshold

**Milestone 3: StateLock Enhancement**
- Extend StateLock coverage to all position update paths
- Implement priority system (Manual > Auto)
- Add debounce for scroll operations
- Implement cancel-and-restart mechanism

### Secondary Goal (Priority Medium)

**Milestone 4: Sync Status UI**
- Design and implement status indicator component
- Add last sync time display
- Implement match result display
- Add timestamp adjustment warning

### Optional Goal (Priority Low)

**Milestone 5: Enhanced Logging and Monitoring**
- Add comprehensive race condition logging
- Implement sync history tracking
- Add performance metrics collection
- Create debug dashboard

---

## Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TTS Position Sync System                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  TTS Player Note │         │  Integrated Note │          │
│  │  (Keychain v5)   │         │  (Auto-Move)     │          │
│  └────────┬─────────┘         └────────┬─────────┘          │
│           │                            │                      │
│           │ savePosition()             │ pollPosition()      │
│           │ (every 3s)                 │ (every 6s)          │
│           ▼                            ▼                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           StateLock (Priority Queue)                │    │
│  │  ┌────────────────┐      ┌────────────────┐        │    │
│  │  │ Manual Click   │ >    │ Auto Poll      │        │    │
│  │  │ Priority: 1    │      │ Priority: 2    │        │    │
│  │  └────────────────┘      └────────────────┘        │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Position Matching Logic                      │    │
│  │  1. Index-First Lookup (lastPlayedIndex)            │    │
│  │  2. Bounds Validation (0 <= index < length)         │    │
│  │  3. Title Confirmation (noteTitle match)            │    │
│  │  4. Fallback to raw index if title mismatch         │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Timestamp Adjustment                         │    │
│  │  1. Future Detection (timestamp > now + tolerance)  │    │
│  │  2. Client Time Replacement (Date.now())            │    │
│  │  3. Adjustment Logging                              │    │
│  │  4. Configurable Tolerance (default: 5min)          │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Server API (Azure Function)             │    │
│  │  PUT /api/playback-position                          │    │
│  │  GET /api/playback-position                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Design

#### 1. PositionMatcher Class

**Purpose**: Handle index-first position matching with validation

**Methods**:
- `matchPosition(lastPlayedData, currentPageNames)`: Returns matched index
- `validateIndex(index, bounds)`: Validates index within bounds
- `confirmByTitle(index, noteTitle, currentPageNames)`: Confirms match by title
- `logMatchResult(result)`: Logs matching outcome

**Interface**:
```javascript
class PositionMatcher {
    matchPosition(lastPlayedData, currentPageNames) {
        // 1. Extract lastPlayedIndex
        // 2. Validate bounds
        // 3. Try title confirmation
        // 4. Return MatchResult { index, method, confidence }
    }
}
```

#### 2. TimestampAdjuster Class

**Purpose**: Handle future timestamp detection and adjustment

**Methods**:
- `detectFutureTimestamp(timestamp)`: Returns true if timestamp is in future
- `adjustTimestamp(timestamp)`: Replaces with client time if needed
- `logAdjustment(original, adjusted)`: Logs timestamp changes
- `setTolerance(minutes)`: Configures tolerance threshold

**Configuration**:
```javascript
const TIMESTAMP_CONFIG = {
    tolerance: 5 * 60 * 1000, // 5 minutes in milliseconds
    autoAdjust: true,
    logAdjustments: true
};
```

#### 3. StateLock Enhanced

**Purpose**: Prevent race conditions in position updates

**Enhanced Features**:
- Priority queue for manual vs automatic updates
- Cancel-in-progress mechanism
- Debounce for scroll operations
- Comprehensive state logging

**Interface**:
```javascript
const StateLock = {
    async acquire(priority, operation) {
        // Cancel lower priority operations
        // Acquire lock with timeout
        // Execute operation
    },
    cancelOperation(operationId) {
        // Cancel in-progress operation
    }
};
```

---

## Risks and Response Plans

### Risk 1: Index Mismatch Between Notes

**Description**: Different `currentPageNames` arrays may cause index offsets

**Probability**: Medium
**Impact**: High

**Response Plan**:
- Add index bounds validation before applying position
- Implement title-based confirmation for safety
- Provide manual position override option
- Log all mismatches for analysis

### Risk 2: Server Timezone Drift

**Description**: M4 Pro server timezone may drift over time

**Probability**: Medium
**Impact**: Medium

**Response Plan**:
- Implement automatic timestamp adjustment
- Add timezone drift detection and alerting
- Provide NTP sync option for critical deployments
- Monitor adjustment frequency

### Risk 3: StateLock Deadlock

**Description**: Enhanced StateLock may cause deadlocks

**Probability**: Low
**Impact**: High

**Response Plan**:
- Implement timeout-based lock release
- Add deadlock detection and recovery
- Provide manual lock release mechanism
- Comprehensive logging for debugging

### Risk 4: Performance Degradation

**Description**: Additional validation and logging may slow sync

**Probability**: Medium
**Impact**: Medium

**Response Plan**:
- Profile critical path performance
- Implement async logging
- Add caching for repeated operations
- Provide performance metrics dashboard

---

## Dependencies

### Internal Dependencies

1. **SPEC-OBSIDIAN-TTSV5-SYNC-001**: Base synchronization system
   - Must complete before starting R3 (StateLock enhancement)
   - Shares `playbackPositionManager` component

2. **Existing Components**:
   - `views/tts-position/view.js`: playbackPositionManager
   - `views/integrated-ui/view.js`: TTSAutoMoveManager
   - `views/scroll-manager/view.js`: scrollPositionManager

### External Dependencies

1. **Azure Function API**: Server endpoints for position sync
2. **M4 Pro Server**: Backend service with timezone considerations

---

## Testing Strategy

### Unit Tests

- `PositionMatcher` index matching logic
- `TimestampAdjuster` detection and adjustment
- `StateLock` priority queue and cancellation

### Integration Tests

- End-to-end position sync between TTS Player and Integrated notes
- Server timestamp adjustment flow
- Manual click vs auto poll race conditions

### Manual Testing Scenarios

1. Create test notes with different `currentPageNames` arrays
2. Simulate server timezone offset
3. Trigger manual click during auto poll
4. Verify status UI accuracy

---

## Success Criteria

1. All index-based position matches succeed within valid bounds
2. All future timestamps adjusted without sync failures
3. No race conditions detected in stress testing (1000+ operations)
4. Sync status UI accurately reflects all states
5. Zero sync failures due to timezone issues
