// ============================================
// M4 Pro Server - Playback Position API
// 파일명: playback-position.js
// 위치: M4 Pro 서버 프로젝트의 routes/ 또는 api/ 디렉토리
// ============================================
//
// Express.js 기반 구현 예시
// Fastify, Koa 등 다른 프레임워크에도 적용 가능
//

const express = require('express');
const router = express.Router();

// ============================================
// 메모리 저장소 (개발용)
// 실제 운영에서는 파일 시스템 또는 DB 사용 권장
// ============================================

let playbackPositionStore = {
    lastPlayedIndex: -1,
    notePath: '',
    noteTitle: '',
    timestamp: 0,
    deviceId: ''
};

// ============================================
// GET /api/playback-position
// 재생 위치 조회
// ============================================

router.get('/playback-position', (req, res) => {
    try {
        console.log('GET /api/playback-position - Fetching playback position');

        res.json({
            lastPlayedIndex: playbackPositionStore.lastPlayedIndex,
            notePath: playbackPositionStore.notePath,
            noteTitle: playbackPositionStore.noteTitle,
            timestamp: playbackPositionStore.timestamp,
            deviceId: playbackPositionStore.deviceId
        });

    } catch (error) {
        console.error('Error fetching playback position:', error);
        res.status(500).json({
            error: 'Failed to fetch playback position',
            details: error.message
        });
    }
});

// ============================================
// PUT /api/playback-position
// 재생 위치 저장
// ============================================

router.put('/playback-position', express.json(), (req, res) => {
    try {
        const { lastPlayedIndex, notePath, noteTitle, deviceId } = req.body;

        // 필수 파라미터 검증
        if (lastPlayedIndex === undefined || lastPlayedIndex < 0) {
            return res.status(400).json({
                error: 'Invalid lastPlayedIndex',
                usage: 'PUT /api/playback-position with body: { "lastPlayedIndex": 0, "notePath": "...", "noteTitle": "...", "deviceId": "..." }'
            });
        }

        // 타임스탬프 기반 충돌 해소
        const newTimestamp = Date.now();
        const currentTimestamp = playbackPositionStore.timestamp || 0;

        // 서버 데이터가 더 최신이면 업데이트 거부
        if (currentTimestamp > newTimestamp) {
            console.log('Conflict: Server data is newer, rejecting update');
            return res.status(409).json({
                error: 'Conflict: Server data is newer',
                serverData: playbackPositionStore
            });
        }

        // 업데이트 수행
        playbackPositionStore = {
            lastPlayedIndex,
            notePath: notePath || '',
            noteTitle: noteTitle || '',
            timestamp: newTimestamp,
            deviceId: deviceId || 'unknown'
        };

        console.log(`Playback position saved: index=${lastPlayedIndex}, note="${noteTitle}", device=${deviceId}`);

        res.json({
            success: true,
            lastPlayedIndex,
            timestamp: newTimestamp
        });

    } catch (error) {
        console.error('Error saving playback position:', error);
        res.status(500).json({
            error: 'Failed to save playback position',
            details: error.message
        });
    }
});

// ============================================
// Express 앱에 라우터 등록 예시
// ============================================

/*
const app = express();
app.use(express.json());

// CORS 헤더 (필요시)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// OPTIONS 처리
app.options('/api/playback-position', (req, res) => {
    res.sendStatus(200);
});

// 라우터 등록
app.use('/api', router);

// 서버 시작
const PORT = 5051;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`M4 Pro TTS Server running on port ${PORT}`);
    console.log(`Playback Position API: http://0.0.0.0:${PORT}/api/playback-position`);
});
*/

module.exports = router;

// ============================================
// 파일 시스템 기반 영구 저장 버전 (선택사항)
// ============================================

/*
const fs = require('fs').promises;
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'playback-position.json');

// 파일에서 로드
async function loadFromFile() {
    try {
        const data = await fs.readFile(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            lastPlayedIndex: -1,
            notePath: '',
            noteTitle: '',
            timestamp: 0,
            deviceId: ''
        };
    }
}

// 파일에 저장
async function saveToFile(data) {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
}

// GET 핸들러 (파일 기반)
router.get('/playback-position', async (req, res) => {
    try {
        const data = await loadFromFile();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT 핸들러 (파일 기반)
router.put('/playback-position', express.json(), async (req, res) => {
    try {
        const { lastPlayedIndex, notePath, noteTitle, deviceId } = req.body;

        const currentData = await loadFromFile();
        const newTimestamp = Date.now();

        // 타임스탬프 기반 충돌 해소
        if (currentData.timestamp > newTimestamp) {
            return res.status(409).json({
                error: 'Conflict: Server data is newer',
                serverData: currentData
            });
        }

        const newData = {
            lastPlayedIndex,
            notePath: notePath || '',
            noteTitle: noteTitle || '',
            timestamp: newTimestamp,
            deviceId: deviceId || 'unknown'
        };

        await saveToFile(newData);

        res.json({
            success: true,
            lastPlayedIndex,
            timestamp: newTimestamp
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
*/
