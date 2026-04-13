# ConfigResolver Integration Guide

**SPEC-ARCH-001** - Quick Start Guide

---

## Overview

ConfigResolver는 obsidian-tts 프로젝트의 설정 관리를 중앙화하는 모듈입니다. operationMode 기반으로 자동으로 endpoint를 라우팅하고, SSE 연결 상태에 따라 동적으로 URL을 전환합니다.

## Quick Start

### 1. ConfigResolver 로드

Obsidian vault의 dataviewjs 블록에서:

```javascript
// ConfigResolver 모듈 로드
await loadScript('../../Projects/obsidian-tts/shared/configResolver.js');
```

### 2. 설정 로드

```javascript
// 설정 로드 (캐싱 포함)
await window.ConfigResolver.loadConfig();
```

### 3. Endpoint 해결

```javascript
// TTS endpoint
const ttsUrl = window.ConfigResolver.resolveEndpoint('tts');

// Position sync endpoint
const positionUrl = window.ConfigResolver.resolveEndpoint('position');

// Scroll sync endpoint
const scrollUrl = window.ConfigResolver.resolveEndpoint('scroll');

// General sync endpoint
const syncUrl = window.ConfigResolver.resolveEndpoint('sync');
```

### 4. SSE 상태 확인

```javascript
// SSE 활성화 확인
if (window.ConfigResolver.isSSEActive()) {
    console.log('SSE mode active - using local endpoints');
} else {
    console.log('Polling mode - using Azure endpoints');
}
```

### 5. Operation Mode 확인

```javascript
// 현재 동작 모드 확인
const mode = window.ConfigResolver.getOperationMode();
console.log('Current mode:', mode); // 'local', 'server', 'hybrid'
```

## Endpoint Resolution Table

| Mode | SSE Active | TTS Endpoint | Sync Endpoint |
|------|------------|--------------|---------------|
| local | Any | localhost:5051 | localhost:5051 |
| server | Any | Azure Function | Azure Function |
| hybrid | NO | localhost:5051 | Azure Function |
| hybrid | YES | localhost:5051 | localhost:5051 |

## Configuration Priority

ConfigResolver는 다음 우선순위로 설정을 병합합니다:

1. **Runtime Config** (`window.ttsEndpointConfig`)
2. **Config File** (`obsidian-tts-config.md`)
3. **Keychain/LocalStorage**
4. **Defaults** (FALLBACK URLs)

## Backward Compatibility

기존 코드를 변경하지 않아도 됩니다:

```javascript
// 안전한 통합 방식
const endpoint = window.ConfigResolver
    ? window.ConfigResolver.resolveEndpoint('position')
    : fallbackUrl; // 기존 로직 사용
```

## Cache Invalidation

설정 변경 후 캐시를 비우려면:

```javascript
window.ConfigResolver.invalidateCache();
await window.ConfigResolver.loadConfig();
```

## Example: View Integration

```javascript
// views/tts-position/view.js 예시
const getPlaybackPositionEndpoint = function() {
    // ConfigResolver 사용 (역호환성 유지)
    if (window.ConfigResolver) {
        return window.ConfigResolver.resolveEndpoint('position');
    }

    // 폴백: 기존 로직
    const FALLBACK_AZURE_URL = 'https://...';
    const modeConfig = window.ttsModeConfig?.features?.positionSync;

    if (modeConfig === 'local') {
        return 'http://localhost:5051/api/playback-position';
    }

    return FALLBACK_AZURE_URL + '/api/playback-position';
};
```

## SSE Automatic Switching

SSE 연결 상태에 따라 자동으로 endpoint가 전환됩니다:

```javascript
// SSE 연결 시 → sseSyncManager에서 자동 호출
window.sseSyncManager.notifySSEStateChange(true);
// → resolveEndpoint('sync')가 로컬 SSE endpoint 반환

// SSE 해제 시 → sseSyncManager에서 자동 호출
window.sseSyncManager.notifySSEStateChange(false);
// → resolveEndpoint('sync')가 Azure Function endpoint 반환
```

## Troubleshooting

### ConfigResolver가 undefined인 경우

```javascript
// 모듈이 로드되었는지 확인
if (!window.ConfigResolver) {
    console.error('ConfigResolver not loaded. Load script first.');
    // Load the module
    await loadScript('../../Projects/obsidian-tts/shared/configResolver.js');
}
```

### Endpoint가 기대와 다른 경우

```javascript
// 현재 설정 확인
const config = window.ConfigResolver.getConfig();
console.log('Current config:', config);

// Operation mode 확인
const mode = window.ConfigResolver.getOperationMode();
console.log('Operation mode:', mode);

// SSE 상태 확인
const sseActive = window.ConfigResolver.isSSEActive();
console.log('SSE active:', sseActive);
```

### 캐시 무효화 필요 시

```javascript
// 설정 변경 후 캐시 비우기
window.ConfigResolver.invalidateCache();
```

## API Reference

### Methods

- `loadConfig(): Promise<Config>` - 설정 로드
- `resolveEndpoint(type): string` - URL 해결
- `isSSEActive(): boolean` - SSE 상태 확인
- `getOperationMode(): OperationMode` - 모드 반환
- `invalidateCache(): void` - 캐시 무효화
- `getConfig(): Config | null` - 현재 설정 반환

### Types

```typescript
type EndpointType = 'tts' | 'sync' | 'position' | 'scroll';
type OperationMode = 'local' | 'server' | 'hybrid';

interface Config {
    operationMode: OperationMode;
    azureFunctionUrl: string;
    edgeServerUrl: string;
    localEdgeTtsUrl: string;
    sseEnabled: boolean;
}
```

## Related Documents

- [Implementation Report](./docs/SPEC-ARCH-001-implementation-report.md)
- [SPEC Document](../.moai/specs/SPEC-ARCH-001/spec.md)
- [Characterization Tests](../shared/configResolver.test.js)

---

**Last Updated**: 2026-02-06
**Version**: 1.0.0
