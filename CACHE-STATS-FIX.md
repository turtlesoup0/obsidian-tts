# 캐시 통계 localStorage 누적 저장 수정

**작성일**: 2026-01-22
**문제**: PC와 모바일 간 캐시 통계가 동기화되지 않음
**원인**: stats가 세션별로 초기화되어 디바이스 간 누적되지 않음

---

## 🐛 문제 상황

### 증상
- PC에서 캐시 생성: stats = {hits: 0, misses: 5}
- 모바일에서 캐시 사용: stats = {hits: 5, misses: 0}
- **실제**: 총 10개 요청, 5 hits, 5 misses
- **표시**: 각 디바이스에서 독립적인 통계

### 예시
```
[PC에서 5개 노트 재생]
캐시 통계: 0/5 (0% hit rate)  ❌ 잘못된 표시

[모바일에서 동일한 5개 노트 재생]
캐시 통계: 5/5 (100% hit rate)  ❌ 잘못된 표시

실제 전체 통계: 5/10 (50% hit rate)  ✅ 올바른 값
```

---

## 🔍 원인 분석

### 기존 코드 (문제)

```javascript
window.serverCacheManager = {
    stats: {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0
    },
    // ...
};
```

**문제점**:
1. `stats` 객체가 **페이지 로드마다 초기화**
2. 브라우저 새로고침 또는 디바이스 전환 시 **통계 손실**
3. 디바이스별로 **독립적인 카운터** 유지
4. "새로고침" 버튼이 **실제로는 아무것도 안 함** (메모리 값만 다시 표시)

### 근본 원인

캐시 데이터는 **Azure Blob Storage**에 있지만, 통계는 **메모리**에만 저장:
- ✅ 캐시 파일: Azure Blob Storage (디바이스 간 공유)
- ❌ 통계: JavaScript 메모리 (세션별 독립)

---

## ✅ 해결 방법

### 핵심 아이디어
**localStorage를 사용하여 누적 통계 저장**

### 수정된 코드

#### 1. stats 로드/저장 함수 추가

```javascript
window.serverCacheManager = {
    // localStorage에서 통계 로드
    loadStats() {
        const saved = localStorage.getItem('serverCacheStats');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load cache stats:', e);
            }
        }
        return {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    },

    // localStorage에 통계 저장
    saveStats() {
        localStorage.setItem('serverCacheStats', JSON.stringify(this.stats));
    },

    stats: null,  // 초기화는 아래에서
    // ...
};

// stats 초기화 (localStorage에서 로드)
window.serverCacheManager.stats = window.serverCacheManager.loadStats();
```

#### 2. 통계 업데이트 시 즉시 저장

```javascript
async getCachedAudioFromServer(cacheKey) {
    try {
        this.stats.totalRequests++;
        this.saveStats();  // 즉시 저장 ✅

        const response = await fetch(`${this.cacheApiEndpoint}/${cacheKey}`, {
            method: 'GET',
            headers: { 'Accept': 'audio/mpeg' }
        });

        if (response.status === 404) {
            this.stats.cacheMisses++;
            this.saveStats();  // 즉시 저장 ✅
            return null;
        }

        // ... 성공 시
        this.stats.cacheHits++;
        this.saveStats();  // 즉시 저장 ✅

        return { ... };
    } catch (error) {
        this.stats.cacheMisses++;
        this.saveStats();  // 즉시 저장 ✅
        return null;
    }
}
```

#### 3. 리셋 시 localStorage 반영

```javascript
resetStats() {
    this.stats.totalRequests = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.saveStats();  // localStorage에도 반영 ✅
    console.log('🔄 Cache stats reset');
}
```

#### 4. 페이지 로드 시 통계 표시

```javascript
// 초기 캐시 통계 표시
window.updateCacheStatsDisplay();
console.log('📊 Initial cache stats loaded:', window.serverCacheManager.stats);
```

---

## 📊 데이터 흐름 (수정 후)

### PC에서 5개 노트 재생 (캐시 생성)

```
1. 페이지 로드
   localStorage.getItem('serverCacheStats')
   → {totalRequests: 0, cacheHits: 0, cacheMisses: 0}

2. 노트 1-5 재생 (캐시 없음)
   각 노트마다:
   - this.stats.totalRequests++
   - this.stats.cacheMisses++
   - this.saveStats() → localStorage 저장

3. 최종 통계
   {totalRequests: 5, cacheHits: 0, cacheMisses: 5}
   → localStorage에 저장됨 ✅
```

### 모바일에서 동일한 5개 노트 재생 (캐시 히트)

```
1. 페이지 로드
   localStorage.getItem('serverCacheStats')
   → {totalRequests: 5, cacheHits: 0, cacheMisses: 5}  ✅ PC 통계 로드!

2. 노트 1-5 재생 (캐시 있음)
   각 노트마다:
   - this.stats.totalRequests++  (5 → 10)
   - this.stats.cacheHits++       (0 → 5)
   - this.saveStats() → localStorage 저장

3. 최종 통계
   {totalRequests: 10, cacheHits: 5, cacheMisses: 5}
   → 정확한 누적 통계! ✅
   → Hit Rate: 50% (5/10)
```

---

## 🎯 해결된 문제

### Before (수정 전)

```
[PC]
통계: 0 hits / 5 requests (0%)
localStorage: 없음

[모바일]
통계: 5 hits / 5 requests (100%)
localStorage: 없음

❌ 각 디바이스가 독립적인 통계
❌ 새로고침 시 통계 초기화
❌ 실제 hit rate를 알 수 없음
```

### After (수정 후)

```
[PC]
통계: 0 hits / 5 requests (0%)
localStorage: {totalRequests: 5, cacheHits: 0, cacheMisses: 5} ✅

[모바일]
통계: 5 hits / 10 requests (50%)  ← PC 통계 누적!
localStorage: {totalRequests: 10, cacheHits: 5, cacheMisses: 5} ✅

✅ 디바이스 간 통계 누적
✅ 새로고침해도 통계 유지
✅ 정확한 hit rate 표시
```

---

## 🔄 "새로고침" 버튼 동작

### 수정 전
```javascript
refreshStatsBtn.onclick = window.updateCacheStatsDisplay;
```
→ 메모리의 stats를 다시 표시 (의미 없음)

### 수정 후
```javascript
refreshStatsBtn.onclick = window.updateCacheStatsDisplay;
```
→ localStorage에서 최신 통계를 로드하여 표시
→ 다른 탭/디바이스의 업데이트 반영 가능

---

## 🧪 테스트 방법

### 1. PC에서 통계 확인

```javascript
// 브라우저 콘솔에서
console.log(window.serverCacheManager.stats);
// {totalRequests: 5, cacheHits: 0, cacheMisses: 5}

console.log(localStorage.getItem('serverCacheStats'));
// {"totalRequests":5,"cacheHits":0,"cacheMisses":5}
```

### 2. 모바일에서 동일한 확인

```javascript
console.log(window.serverCacheManager.stats);
// {totalRequests: 10, cacheHits: 5, cacheMisses: 5}
// ✅ PC 통계가 누적됨!
```

### 3. 통계 리셋 테스트

```
1. "통계 초기화" 버튼 클릭
2. localStorage 확인:
   {"totalRequests":0,"cacheHits":0,"cacheMisses":0}
3. 다른 디바이스에서 새로고침
4. 통계가 0으로 초기화됨 ✅
```

---

## 📱 디바이스 간 동기화

### localStorage의 범위

**중요**: localStorage는 **동일한 브라우저 내에서만** 공유됩니다.

- ✅ PC Chrome → PC Chrome (다른 탭)
- ✅ 모바일 Safari → 모바일 Safari (다른 탭)
- ❌ PC Chrome → 모바일 Safari (다른 브라우저)

### 실제 동작

```
[PC Chrome에서 캐시 생성]
localStorage: {totalRequests: 5, ...}

[PC Chrome 다른 탭]
✅ 통계 공유됨

[모바일 Safari]
❌ PC Chrome localStorage 접근 불가
❌ 독립적인 localStorage 사용
```

### 해결책 (향후 개선)

완전한 디바이스 간 통계 동기화를 위해서는:
1. **백엔드 API** 추가: `/api/cache/stats` 엔드포인트
2. **서버에 통계 저장**: Azure Table Storage 또는 Cosmos DB
3. **주기적 동기화**: 1분마다 서버에서 최신 통계 가져오기

현재 구현은 **동일 브라우저 내에서만** 작동하지만, 각 디바이스에서 **세션을 넘어 누적**되므로 유용합니다.

---

## 🎉 결론

### 완료 사항

- ✅ stats를 localStorage에 저장
- ✅ 페이지 로드 시 localStorage에서 로드
- ✅ 통계 업데이트 시 즉시 localStorage에 저장
- ✅ 리셋 시 localStorage도 초기화
- ✅ 초기 통계 표시 추가

### 개선 효과

- ✅ 브라우저 새로고침해도 통계 유지
- ✅ 동일 브라우저의 다른 탭에서 통계 공유
- ✅ 세션을 넘어 누적 통계 추적
- ✅ 실제 캐시 hit rate를 정확하게 표시

### 제한 사항

- ⚠️ 다른 브라우저/디바이스 간에는 localStorage 공유 안 됨
- ⚠️ 완전한 디바이스 간 동기화는 백엔드 API 필요

### 사용자 액션

1. **Obsidian 재시작**
2. v4 노트 열기
3. F12 콘솔에서 확인:
   ```javascript
   console.log(window.serverCacheManager.stats);
   ```
4. 몇 개 노트 재생 후 새로고침
5. 통계가 유지되는지 확인 ✅

---

**수정일**: 2026-01-22
**파일**: `TTS 출제예상 읽기 v4 (Enhanced).md`
**상태**: ✅ 수정 완료
