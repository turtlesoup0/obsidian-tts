# 🚀 Obsidian TTS 미래 로드맵

**작성일**: 2026-01-22
**현재 버전**: v4.0.0
**목적**: 다양한 관점에서 프로젝트를 발전시키기 위한 기능 계획

---

## 📊 카테고리별 피처 분류

### 🎯 우선순위 기준
- **P0 (Critical)**: 즉시 구현 필요, 사용자 경험에 직접 영향
- **P1 (High)**: 다음 마이너 버전에 포함
- **P2 (Medium)**: 다음 메이저 버전 고려
- **P3 (Low)**: 장기 계획

---

## 1️⃣ 사용자 경험 개선 (UX Enhancement)

### 1.1 재생 컨트롤 고도화 [P1]

#### 기능: 북마크 시스템
- 특정 노트에 북마크 추가
- 북마크한 노트만 재생 모드
- 북마크 폴더별 그룹핑

**구현 방안**:
```javascript
// localStorage에 북마크 저장
window.bookmarkManager = {
    bookmarks: [], // [{notePath, timestamp, tags}]

    addBookmark(notePath, tags = []) {
        this.bookmarks.push({
            notePath,
            timestamp: Date.now(),
            tags
        });
        this.save();
    },

    playBookmarkedOnly() {
        const pages = this.bookmarks.map(b =>
            dv.page(b.notePath)
        ).filter(p => p);
        // 재생 시작
    }
};
```

**예상 효과**: 중요 노트만 집중 학습 가능

---

#### 기능: 재생 목록 (Playlist) [P1]

**사용 시나리오**:
```
[학습 순서]
1. 기초 개념 (50개 노트)
2. 심화 개념 (30개 노트)
3. 실전 문제 (20개 노트)

→ 플레이리스트 3개로 분리하여 단계별 학습
```

**구현 방안**:
```javascript
window.playlistManager = {
    playlists: {
        "기초개념": ["path1", "path2", ...],
        "심화개념": ["path3", "path4", ...],
        "실전문제": ["path5", "path6", ...]
    },

    playPlaylist(name) {
        const paths = this.playlists[name];
        // 재생 시작
    },

    createPlaylistFromTags(tag) {
        // #기초 태그가 있는 노트만 플레이리스트 생성
    }
};
```

**UI 개선**:
```markdown
📚 플레이리스트
- [▶️ 기초개념] (50개 노트, 2시간 30분)
- [▶️ 심화개념] (30개 노트, 1시간 45분)
- [▶️ 실전문제] (20개 노트, 1시간 10분)
```

---

#### 기능: 반복 재생 모드 [P2]

**옵션**:
- 단일 노트 반복
- 플레이리스트 반복
- 랜덤 재생 (셔플)

**구현**:
```javascript
window.repeatMode = {
    mode: 'none', // 'none', 'one', 'all', 'shuffle'

    setMode(mode) {
        this.mode = mode;
        this.updateUI();
    },

    getNextIndex(currentIndex, totalLength) {
        switch(this.mode) {
            case 'one': return currentIndex;
            case 'shuffle': return Math.floor(Math.random() * totalLength);
            case 'all': return (currentIndex + 1) % totalLength;
            default: return currentIndex + 1;
        }
    }
};
```

**예상 효과**: 암기 효율 극대화

---

### 1.2 청취 통계 및 진행도 추적 [P1]

#### 기능: 노트별 청취 기록

**추적 항목**:
- 노트별 재생 횟수
- 총 청취 시간
- 마지막 청취 날짜
- 완료율 (전체 노트 중 들은 비율)

**구현**:
```javascript
window.listeningStats = {
    stats: {}, // {notePath: {playCount, totalTime, lastPlayed}}

    recordPlay(notePath, duration) {
        if (!this.stats[notePath]) {
            this.stats[notePath] = {
                playCount: 0,
                totalTime: 0,
                lastPlayed: null
            };
        }

        this.stats[notePath].playCount++;
        this.stats[notePath].totalTime += duration;
        this.stats[notePath].lastPlayed = Date.now();

        this.save();
    },

    getWeakPoints() {
        // 재생 횟수가 적은 노트 = 약점
        return Object.entries(this.stats)
            .sort((a, b) => a[1].playCount - b[1].playCount)
            .slice(0, 10);
    }
};
```

**UI 대시보드**:
```markdown
📊 학습 통계
- 총 청취 시간: 42시간 30분
- 완료한 노트: 87 / 100 (87%)
- 가장 많이 들은 노트: "API 설계 패턴" (15회)
- 약점 노트: "분산 트랜잭션" (1회)

📈 주간 진행도
월: ████████░░ 80%
화: ██████░░░░ 60%
수: ██████████ 100%
...
```

---

#### 기능: 학습 리마인더 [P2]

**시나리오**:
```
[알림]
🔔 "분산 트랜잭션" 노트를 마지막으로 들은 지 7일이 지났습니다.
   복습이 필요할 수 있습니다.

[제안]
📚 오늘의 추천 복습 노트 (5개)
- CAP 이론 (마지막 청취: 5일 전)
- ACID 속성 (마지막 청취: 6일 전)
- 분산 트랜잭션 (마지막 청취: 7일 전)
```

**구현 (브라우저 알림)**:
```javascript
window.reminderManager = {
    checkReminders() {
        const now = Date.now();
        const WEEK = 7 * 24 * 60 * 60 * 1000;

        const needsReview = Object.entries(window.listeningStats.stats)
            .filter(([path, stat]) => now - stat.lastPlayed > WEEK)
            .map(([path]) => path);

        if (needsReview.length > 0) {
            this.showNotification(needsReview);
        }
    }
};
```

---

### 1.3 접근성 개선 (Accessibility) [P1]

#### 기능: 키보드 단축키

**단축키 맵**:
```
Space       재생/일시정지
→          다음 노트
←          이전 노트
↑          볼륨 +10%
↓          볼륨 -10%
Shift + →  +10초 건너뛰기
Shift + ←  -10초 뒤로가기
R          반복 모드 전환
S          셔플 모드 전환
B          현재 노트 북마크
```

**구현**:
```javascript
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // 입력 중이면 무시

    switch(e.key) {
        case ' ':
            e.preventDefault();
            window.azureTTSReader.isPaused
                ? window.azureTTSPlay()
                : window.azureTTSPause();
            break;
        case 'ArrowRight':
            if (e.shiftKey) {
                window.azureTTSReader.audioElement.currentTime += 10;
            } else {
                window.azureTTSNext();
            }
            break;
        // ... 더 많은 단축키
    }
});
```

---

#### 기능: 다국어 지원 [P3]

**지원 언어**:
- 한국어 (기본)
- 영어
- 일본어
- 중국어 (간체/번체)

**구현**:
```javascript
window.i18n = {
    locale: 'ko',
    translations: {
        ko: {
            playButton: '재생 시작',
            pauseButton: '일시정지',
            stopButton: '정지'
        },
        en: {
            playButton: 'Play',
            pauseButton: 'Pause',
            stopButton: 'Stop'
        }
    },

    t(key) {
        return this.translations[this.locale][key] || key;
    }
};
```

---

## 2️⃣ 음성 품질 개선 (Audio Quality)

### 2.1 음성 커스터마이징 [P1]

#### 기능: 프리셋 저장

**사용 시나리오**:
```
[프리셋 1: 빠른 복습]
- 음성: SunHiNeural
- 속도: 1.5x
- 볼륨: 100%

[프리셋 2: 자기 전 청취]
- 음성: InJoonNeural (차분한 남성)
- 속도: 0.8x
- 볼륨: 60%

[프리셋 3: 운동 중]
- 음성: BongJinNeural (명확한 발음)
- 속도: 1.0x
- 볼륨: 120% (강조)
```

**구현**:
```javascript
window.voicePresets = {
    presets: {
        "빠른복습": {
            voice: 'ko-KR-SunHiNeural',
            rate: 1.5,
            volume: 100
        },
        "자기전청취": {
            voice: 'ko-KR-InJoonNeural',
            rate: 0.8,
            volume: 60
        }
    },

    applyPreset(name) {
        const preset = this.presets[name];
        window.azureTTSReader.playbackRate = preset.rate;
        // ... 다른 설정 적용
    }
};
```

---

#### 기능: 동적 음성 변경 [P2]

**아이디어**: 텍스트 유형에 따라 음성 자동 변경

```javascript
// 정의 부분: 여성 음성 (명확함)
정의: API는 Application Programming Interface의 약자입니다.
→ SunHiNeural

// 키워드 부분: 남성 음성 (강조)
키워드: REST, GraphQL, gRPC
→ InJoonNeural
```

**구현**:
```javascript
window.dynamicVoice = {
    voiceMap: {
        definition: 'ko-KR-SunHiNeural',
        keyword: 'ko-KR-InJoonNeural',
        example: 'ko-KR-BongJinNeural'
    },

    buildSSMLWithVoice(text) {
        // 섹션별로 다른 음성 적용
        const defPart = `<voice name="${this.voiceMap.definition}">${definition}</voice>`;
        const kwPart = `<voice name="${this.voiceMap.keyword}">${keyword}</voice>`;
        return defPart + kwPart;
    }
};
```

---

### 2.2 고급 SSML 기능 [P2]

#### 기능: 감정 표현

**Azure Neural Voice 감정 지원**:
```xml
<mstts:express-as style="cheerful">
    시험에 합격했습니다!
</mstts:express-as>

<mstts:express-as style="serious">
    보안 취약점이 발견되었습니다.
</mstts:express-as>
```

**자동 감정 매핑**:
```javascript
const emotionKeywords = {
    cheerful: ['성공', '합격', '축하'],
    serious: ['보안', '위험', '중요'],
    sad: ['실패', '오류', '문제']
};

function detectEmotion(text) {
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some(kw => text.includes(kw))) {
            return emotion;
        }
    }
    return 'neutral';
}
```

---

#### 기능: 발음 사전 (Pronunciation Dictionary) [P1]

**문제 상황**:
```
"API" → "아피" (잘못된 발음)
"REST" → "레스트" (잘못된 발음)
"OAuth" → "오아스" (잘못된 발음)
```

**해결**: 발음 사전 추가
```javascript
window.pronunciationDict = {
    dict: {
        "API": "에이피아이",
        "REST": "레스트",
        "OAuth": "오어스",
        "CRUD": "크루드",
        "SQL": "에스큐엘",
        "NoSQL": "노에스큐엘",
        "JWT": "제이더블유티"
    },

    applyPronunciation(text) {
        let result = text;
        for (const [word, pronunciation] of Object.entries(this.dict)) {
            // <phoneme>을 사용하거나 직접 한글로 치환
            result = result.replace(
                new RegExp(word, 'g'),
                pronunciation
            );
        }
        return result;
    }
};
```

**SSML phoneme 태그 사용** (더 정교한 방법):
```xml
<phoneme alphabet="ipa" ph="eɪ.pi.aɪ">API</phoneme>
```

**사용자 정의 발음 사전**:
```markdown
## 나만의 발음 사전
| 단어 | 발음 |
|------|------|
| Docker | 도커 |
| Kubernetes | 쿠버네티스 |
| PostgreSQL | 포스트그레스큐엘 |
```

---

### 2.3 오디오 후처리 [P3]

#### 기능: 배경 음악 삽입

**사용 시나리오**: 집중력 향상을 위한 백색소음 또는 클래식 음악

**구현**:
```javascript
window.backgroundMusic = {
    enabled: false,
    audioContext: new AudioContext(),

    async playWithBackground(audioBlob) {
        const ttsSource = await this.loadAudio(audioBlob);
        const bgSource = await this.loadAudio('/assets/background.mp3');

        // TTS 볼륨: 100%, 배경음악 볼륨: 20%
        const ttsGain = this.audioContext.createGain();
        ttsGain.gain.value = 1.0;

        const bgGain = this.audioContext.createGain();
        bgGain.gain.value = 0.2;

        ttsSource.connect(ttsGain);
        bgSource.connect(bgGain);

        ttsGain.connect(this.audioContext.destination);
        bgGain.connect(this.audioContext.destination);

        ttsSource.start();
        bgSource.start();
    }
};
```

---

## 3️⃣ 백엔드 확장 (Backend Enhancement)

### 3.1 고급 캐싱 전략 [P1]

#### 기능: 캐시 예열 (Cache Warming)

**아이디어**: 자주 듣는 노트는 미리 캐싱

**구현**:
```javascript
// 백엔드: src/functions/cache-warm.js
app.http('cache-warm', {
    route: 'cache/warm',
    handler: async (request, context) => {
        const { notePaths } = await request.json();

        const results = [];
        for (const path of notePaths) {
            // TTS 생성 및 캐싱
            const audio = await generateTTS(path);
            await saveToCache(path, audio);
            results.push({ path, cached: true });
        }

        return { jsonBody: { results } };
    }
});
```

**프론트엔드**: 자주 듣는 노트 자동 예열
```javascript
window.cacheWarmer = {
    async warmFrequentNotes() {
        const frequent = window.listeningStats.getTopPlayed(10);

        await fetch('/api/cache/warm', {
            method: 'POST',
            body: JSON.stringify({ notePaths: frequent })
        });
    }
};

// 앱 시작 시 자동 실행
window.addEventListener('load', () => {
    window.cacheWarmer.warmFrequentNotes();
});
```

---

#### 기능: 캐시 우선순위 관리 [P2]

**전략**: LRU (Least Recently Used) 기반 자동 정리

**구현**:
```javascript
// src/functions/cache-cleanup.js
app.timer('cache-cleanup', {
    schedule: '0 0 3 * * *', // 매일 새벽 3시
    handler: async (timer, context) => {
        const containerClient = getBlobServiceClient()
            .getContainerClient('tts-cache');

        const blobs = [];
        for await (const blob of containerClient.listBlobsFlat()) {
            blobs.push({
                name: blob.name,
                lastAccessed: blob.properties.lastAccessedOn,
                size: blob.properties.contentLength
            });
        }

        // 30일 동안 접근 안 된 캐시 삭제
        const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const toDelete = blobs.filter(b => b.lastAccessed < threshold);

        for (const blob of toDelete) {
            await containerClient.deleteBlob(blob.name);
            context.log(`Deleted: ${blob.name}`);
        }

        context.log(`Cleanup: ${toDelete.length} files deleted`);
    }
});
```

---

### 3.2 실시간 동기화 [P2]

#### 기능: WebSocket 기반 실시간 진행도 공유

**사용 시나리오**: 여러 디바이스에서 동시에 재생 위치 동기화

**구현**:
```javascript
// 백엔드: Azure SignalR Service 사용
const signalR = require('@microsoft/signalr');

app.http('sync-position', {
    route: 'sync/position',
    handler: async (request, context) => {
        const { userId, position, noteId } = await request.json();

        // 다른 디바이스에 브로드캐스트
        await signalRClient.send('updatePosition', {
            userId,
            position,
            noteId
        });

        return { jsonBody: { success: true } };
    }
});
```

**프론트엔드**:
```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl('/api/sync')
    .build();

connection.on('updatePosition', (data) => {
    if (data.userId === currentUserId) {
        // 다른 디바이스에서 재생 위치 변경됨
        window.azureTTSReader.currentIndex = data.position;
    }
});
```

---

### 3.3 API 확장 [P2]

#### 기능: 배치 TTS 생성

**API**:
```javascript
// POST /api/tts-batch
{
    "requests": [
        { "text": "노트 1 내용", "voice": "ko-KR-SunHiNeural" },
        { "text": "노트 2 내용", "voice": "ko-KR-SunHiNeural" },
        // ... 최대 10개
    ]
}
```

**응답**:
```javascript
{
    "results": [
        { "index": 0, "audioUrl": "blob-url-1", "size": 12345 },
        { "index": 1, "audioUrl": "blob-url-2", "size": 23456 }
    ]
}
```

**장점**:
- 한 번의 요청으로 여러 노트 처리
- 네트워크 오버헤드 감소
- 전체 플레이리스트 미리 로딩 가능

---

#### 기능: 스트리밍 TTS [P3]

**현재**: 전체 오디오 생성 후 반환
**개선**: 생성되는 대로 스트리밍

**구현**:
```javascript
app.http('tts-stream-live', {
    route: 'tts-stream-live',
    handler: async (request, context) => {
        const { text } = await request.json();

        // Azure TTS Streaming API 사용
        const stream = await synthesizeSpeechStream(text);

        return {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Transfer-Encoding': 'chunked'
            },
            body: stream
        };
    }
});
```

**효과**: 대기 시간 감소 (First Byte Time 최소화)

---

## 4️⃣ 비용 최적화 (Cost Optimization)

### 4.1 인텔리전트 캐싱 [P1]

#### 기능: 캐시 히트율 기반 자동 조정

**전략**:
```javascript
// 캐시 히트율이 낮은 경우 TTL 감소
if (hitRate < 50%) {
    TTL = 7일; // 기존 30일에서 단축
}

// 캐시 히트율이 높은 경우 TTL 증가
if (hitRate > 80%) {
    TTL = 60일; // 기존 30일에서 연장
}
```

**구현**:
```javascript
// src/functions/cache-analytics.js
app.timer('cache-analytics', {
    schedule: '0 0 * * * *', // 매시간
    handler: async (timer, context) => {
        const stats = await getCacheStats();
        const hitRate = stats.hits / stats.total;

        if (hitRate < 0.5) {
            context.log('Low hit rate, reducing TTL');
            await updateCacheTTL(7);
        } else if (hitRate > 0.8) {
            context.log('High hit rate, extending TTL');
            await updateCacheTTL(60);
        }
    }
});
```

---

### 4.2 압축 및 최적화 [P2]

#### 기능: 오디오 압축

**현재**: 16kHz 32kbps MP3
**개선**: 적응형 비트레이트

```javascript
function getOptimalBitrate(text) {
    if (text.length < 100) {
        return '24kbps'; // 짧은 텍스트는 낮은 비트레이트
    } else if (text.length < 500) {
        return '32kbps'; // 중간
    } else {
        return '48kbps'; // 긴 텍스트는 높은 품질
    }
}
```

**예상 절감**: 30-40% 스토리지 비용 감소

---

#### 기능: 델타 캐싱 [P3]

**아이디어**: 노트가 조금만 수정된 경우, 전체를 다시 생성하지 않고 변경된 부분만 생성

**구현**:
```javascript
async function generateDeltaTTS(oldText, newText, oldAudioBlob) {
    const diff = computeDiff(oldText, newText);

    if (diff.changedRatio < 0.2) {
        // 20% 미만 변경 시 델타만 생성
        const deltaAudio = await generateTTS(diff.changedParts);
        return mergeAudio(oldAudioBlob, deltaAudio, diff.positions);
    } else {
        // 20% 이상 변경 시 전체 재생성
        return generateTTS(newText);
    }
}
```

---

## 5️⃣ 모바일 최적화 (Mobile Optimization)

### 5.1 오프라인 지원 [P1]

#### 기능: Service Worker 기반 오프라인 캐싱

**구현**:
```javascript
// service-worker.js
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('tts-audio-v1').then((cache) => {
            return cache.addAll([
                '/assets/icons/',
                '/assets/styles.css'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/cache/')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((fetchResponse) => {
                    return caches.open('tts-audio-v1').then((cache) => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
    }
});
```

**효과**: 네트워크 없이도 이미 들은 노트 재생 가능

---

### 5.2 배터리 최적화 [P2]

#### 기능: 저전력 모드

**전략**:
- 화면 꺼짐 시 UI 업데이트 중단
- 캐시 통계 업데이트 빈도 감소
- 불필요한 fetch 최소화

**구현**:
```javascript
window.powerSaver = {
    enabled: false,

    enable() {
        this.enabled = true;

        // UI 업데이트 간격 증가 (1초 → 5초)
        clearInterval(window.uiUpdateInterval);
        window.uiUpdateInterval = setInterval(updateUI, 5000);

        // 캐시 통계 자동 업데이트 비활성화
        window.autoUpdateCacheStats = false;
    },

    disable() {
        this.enabled = false;
        clearInterval(window.uiUpdateInterval);
        window.uiUpdateInterval = setInterval(updateUI, 1000);
        window.autoUpdateCacheStats = true;
    }
};

// 배터리 API 사용
navigator.getBattery().then((battery) => {
    if (battery.level < 0.2) {
        window.powerSaver.enable();
    }
});
```

---

## 6️⃣ 통합 및 연동 (Integration)

### 6.1 외부 서비스 연동 [P2]

#### 기능: Anki 연동

**사용 시나리오**: 암기 카드와 TTS 동기화

**구현**:
```javascript
window.ankiConnector = {
    async exportToAnki(notePath, audioBlob) {
        const note = dv.page(notePath);

        await fetch('http://localhost:8765', {
            method: 'POST',
            body: JSON.stringify({
                action: 'addNote',
                params: {
                    note: {
                        deckName: 'Obsidian TTS',
                        modelName: 'Basic',
                        fields: {
                            Front: note.file.name,
                            Back: note.정의
                        },
                        audio: [{
                            data: await blobToBase64(audioBlob),
                            filename: `${notePath}.mp3`,
                            fields: ['Back']
                        }]
                    }
                }
            })
        });
    }
};
```

---

#### 기능: Notion 연동 [P3]

**사용 시나리오**: Notion 데이터베이스를 TTS로 읽기

**구현**:
```javascript
window.notionConnector = {
    async fetchNotionDB(databaseId) {
        const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28'
            }
        });

        const data = await response.json();

        // Notion 페이지를 TTS로 변환
        for (const page of data.results) {
            const text = extractTextFromNotion(page);
            await generateAndCacheTTS(text);
        }
    }
};
```

---

### 6.2 웹 브라우저 확장 [P3]

#### 기능: Chrome Extension

**기능**:
- 웹 페이지의 선택된 텍스트를 바로 TTS로 읽기
- 뉴스 기사 전체를 TTS로 변환
- YouTube 자막을 한국어 TTS로 읽기

**구현**:
```javascript
// background.js
chrome.contextMenus.create({
    id: 'obsidian-tts',
    title: 'Obsidian TTS로 읽기',
    contexts: ['selection']
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'obsidian-tts') {
        const text = info.selectionText;

        fetch('https://your-function-app.azurewebsites.net/api/tts-stream', {
            method: 'POST',
            body: JSON.stringify({ text })
        }).then(response => response.blob())
          .then(blob => {
              const audio = new Audio(URL.createObjectURL(blob));
              audio.play();
          });
    }
});
```

---

## 7️⃣ AI 기반 기능 (AI-Powered Features)

### 7.1 스마트 요약 [P2]

#### 기능: 긴 노트 자동 요약

**사용 시나리오**:
```
[원본 노트: 5,000자]
→ GPT-4로 200자 요약 생성
→ 요약본을 TTS로 읽기
→ 전체 노트는 "자세히 듣기" 버튼으로 제공
```

**구현**:
```javascript
window.smartSummarizer = {
    async summarize(text) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{
                    role: 'user',
                    content: `다음 텍스트를 200자 이내로 요약해주세요:\n\n${text}`
                }],
                max_tokens: 100
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }
};
```

**UI**:
```markdown
📝 API 설계 패턴
🎧 [▶️ 요약 듣기] (30초)
📖 [▶️ 전체 듣기] (5분 30초)
```

---

### 7.2 자동 퀴즈 생성 [P3]

#### 기능: 노트 내용 기반 퀴즈 자동 생성

**구현**:
```javascript
window.quizGenerator = {
    async generateQuiz(note) {
        const prompt = `
다음 노트 내용을 바탕으로 4지선다 퀴즈 3문제를 생성해주세요:

${note.정의}

형식:
Q1: [질문]
A) [선택지1]
B) [선택지2]
C) [선택지3]
D) [선택지4]
정답: [A/B/C/D]
`;

        const quiz = await callGPT4(prompt);
        return quiz;
    },

    async playQuizMode(notePath) {
        const note = dv.page(notePath);

        // 1. 노트 읽기
        await playNote(note);

        // 2. 퀴즈 생성
        const quiz = await this.generateQuiz(note);

        // 3. 퀴즈 음성으로 읽기
        await playQuiz(quiz);

        // 4. 사용자 답변 대기
        const answer = await getUserAnswer();

        // 5. 정답 확인 및 피드백
        await playFeedback(answer);
    }
};
```

---

## 8️⃣ 성능 및 확장성 (Performance & Scalability)

### 8.1 CDN 통합 [P2]

#### 기능: Azure CDN으로 오디오 배포

**현재**: Blob Storage에서 직접 다운로드
**개선**: CDN을 통한 글로벌 배포

**설정**:
```bash
# Azure CDN 프로필 생성
az cdn profile create \
  --name obsidian-tts-cdn \
  --resource-group speech-resources \
  --sku Standard_Microsoft

# CDN 엔드포인트 생성
az cdn endpoint create \
  --name obsidian-tts-cache \
  --profile-name obsidian-tts-cdn \
  --resource-group speech-resources \
  --origin obsidiantts.blob.core.windows.net
```

**효과**:
- 전 세계 어디서나 빠른 응답 속도
- Blob Storage 대역폭 비용 절감
- 캐시 히트율 향상

---

### 8.2 마이크로서비스 분리 [P3]

#### 구조 개선:

**현재 (모놀리식)**:
```
Azure Functions
├── tts-stream (TTS 생성)
├── cache (캐싱)
├── cache-stats (통계)
└── get-usage (사용량)
```

**개선 (마이크로서비스)**:
```
TTS Service (Azure Functions)
├── tts-stream

Cache Service (Azure Functions)
├── cache-read
├── cache-write
├── cache-stats
├── cache-cleanup

Analytics Service (Azure Functions)
├── usage-tracking
├── listening-stats
├── recommendations

API Gateway (Azure API Management)
└── 모든 서비스 통합
```

**장점**:
- 독립적 스케일링
- 장애 격리
- 개발 팀 분리 가능

---

## 🎯 우선순위 요약

### v4.1 (단기 - 1-2개월)
- [ ] 재생 목록 (Playlist)
- [ ] 발음 사전
- [ ] 청취 통계 대시보드
- [ ] 키보드 단축키
- [ ] 캐시 예열

### v4.5 (중기 - 3-6개월)
- [ ] 북마크 시스템
- [ ] 음성 프리셋
- [ ] 배치 TTS API
- [ ] 오프라인 지원
- [ ] Anki 연동

### v5.0 (장기 - 6-12개월)
- [ ] 스마트 요약 (AI)
- [ ] 자동 퀴즈 생성
- [ ] 실시간 동기화
- [ ] Chrome Extension
- [ ] 마이크로서비스 아키텍처

---

**작성일**: 2026-01-22
**다음 검토일**: 2026-02-22
**피드백**: GitHub Issues에서 의견을 남겨주세요!
