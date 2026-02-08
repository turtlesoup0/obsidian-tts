
```dataviewjs
// ============================================
// 🧩 모듈 로딩 (의존성 순서대로)
// ============================================

// 1. 공유 유틸리티
await dv.view("views/tts-core");

// 2. 설정 로딩
await dv.view("views/tts-config");

// 3. 텍스트 처리
await dv.view("views/tts-text");

// 4. 캐시 관리
await dv.view("views/tts-cache");

// 5. 재생 위치 관리
await dv.view("views/tts-position");
const CONFIG = {
    EXAM_RANGE: { start: 134, end: 137 },
};

// ============================================
// 📚 페이지 쿼리 (dv 사용)
// ============================================
let TAG_QUERY = '#출제예상';
//for (let i = CONFIG.EXAM_RANGE.start; i <= CONFIG.EXAM_RANGE.end; i++) {
//    TAG_QUERY += ` or #${i}관 or #${i}응`;
//}

const pages = dv.pages(`"1_Project/정보 관리 기술사" and -#검색제외 and (${TAG_QUERY})`)
    .sort(b => [b.file.folder, b.file.name], 'asc')
    .array();

// ============================================
// 🎵 엔진 + UI 로딩 (pages 전달)
// ============================================

// 6. 종소리 모듈
await dv.view("views/tts-bell");

// 7. TTS 재생 엔진
await dv.view("views/tts-engine", { pages });

// 7. UI 생성
await dv.view("views/tts-ui", { pages, dv });
```

[해시태그:: #검색제외]
