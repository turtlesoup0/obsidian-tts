const { app } = require('@azure/functions');
const { getPlaybackStateContainer } = require('../../shared/blobHelper');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');

const STATE_BLOB_NAME = 'playback-state.json';
const CONFLICT_LOG_BLOB_NAME = 'conflict-log.json';

/**
 * 스트림을 버퍼로 변환
 */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}

/**
 * 충돌 로그 기록
 */
async function logConflict(containerClient, clientState, serverState) {
  try {
    const logEntry = {
      timestamp: Date.now(),
      clientState: {
        deviceId: clientState.deviceId,
        lastPlayedIndex: clientState.lastPlayedIndex,
        currentTime: clientState.playbackState?.currentTime,
        status: clientState.playbackState?.status
      },
      serverState: {
        deviceId: serverState.deviceId,
        lastPlayedIndex: serverState.lastPlayedIndex,
        currentTime: serverState.playbackState?.currentTime,
        status: serverState.playbackState?.status
      },
      resolution: 'server-wins'
    };

    const blobClient = containerClient.getBlockBlobClient(CONFLICT_LOG_BLOB_NAME);
    const exists = await blobClient.exists();

    let existingLog = [];
    if (exists) {
      const downloadResponse = await blobClient.download();
      const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
      existingLog = JSON.parse(downloaded.toString());
    }

    // 최근 100개만 유지
    existingLog.push(logEntry);
    const recentLog = existingLog.slice(-100);

    const content = JSON.stringify(recentLog, null, 2);
    await blobClient.upload(content, content.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/json',
        blobCacheControl: 'no-cache'
      }
    });
  } catch (error) {
    // 충돌 로그 실패는 메인 기능에 영향을 주지 않음
    console.error('[PLAYBACK-STATE] Failed to log conflict:', error);
  }
}

// GET/PUT /api/playback-state - 향상된 디바이스 간 재생 상태 동기화
app.http('playback-state', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'playback-state',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    const containerClient = await getPlaybackStateContainer();

    // GET: 재생 상태 조회
    if (request.method === 'GET') {
      try {
        context.log('[PLAYBACK-STATE-GET] Request received');

        // 컨테이너 생성 (없으면)
        await containerClient.createIfNotExists({ access: 'blob' });

        const blobClient = containerClient.getBlobClient(STATE_BLOB_NAME);
        const exists = await blobClient.exists();

        if (!exists) {
          context.log('[PLAYBACK-STATE-GET] No state found');
          return {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              lastPlayedIndex: -1,
              playbackState: { status: 'stopped' }
            }
          };
        }

        // 재생 상태 다운로드
        const downloadResponse = await blobClient.download();
        const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
        const state = JSON.parse(downloaded.toString());

        context.log(`[PLAYBACK-STATE-GET] State retrieved: index=${state.lastPlayedIndex}, device=${state.deviceId}`);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: state
        };

      } catch (error) {
        context.error('[PLAYBACK-STATE-GET] Failed:', error);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to retrieve playback state',
            message: error.message
          }
        };
      }
    }

    // PUT: 재생 상태 저장
    if (request.method === 'PUT') {
      try {
        const clientState = await request.json();

        context.log('[PLAYBACK-STATE-PUT] Request received:', {
          index: clientState.lastPlayedIndex,
          deviceId: clientState.deviceId,
          currentTime: clientState.playbackState?.currentTime,
          status: clientState.playbackState?.status
        });

        // 입력 검증
        if (typeof clientState.lastPlayedIndex !== 'number' || clientState.lastPlayedIndex < -1) {
          return {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { error: 'Invalid lastPlayedIndex: must be a number >= -1' }
          };
        }

        // 컨테이너 생성 (없으면)
        await containerClient.createIfNotExists({ access: 'blob' });

        // 현재 서버 상태 조회
        const blobClient = containerClient.getBlockBlobClient(STATE_BLOB_NAME);
        const exists = await blobClient.exists();
        let serverState = null;

        if (exists) {
          const downloadResponse = await blobClient.download();
          const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
          serverState = JSON.parse(downloaded.toString());
        }

        // 충돌 감지: 타임스탬프 비교
        const clientTimestamp = clientState.playbackState?.lastUpdated || clientState.timestamp;
        const serverTimestamp = serverState?.playbackState?.lastUpdated || serverState?.timestamp;

        let conflict = false;

        // 서버 상태가 더 최신인 경우 충돌 처리
        if (serverState && serverTimestamp && clientTimestamp < serverTimestamp) {
          conflict = true;
          context.log('[PLAYBACK-STATE-PUT] Conflict detected - server is newer');

          // 충돌 로그 기록
          await logConflict(containerClient, clientState, serverState);

          return {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              success: true,
              timestamp: serverTimestamp,
              conflict: true,
              serverState: serverState,
              message: '서버에 더 최신 상태가 있습니다. 서버 상태가 적용되었습니다.'
            }
          };
        }

        // Debouncing: 5초 이내의 중복 업데이트 무시
        if (serverState && clientTimestamp && serverTimestamp &&
            Math.abs(clientTimestamp - serverTimestamp) < 5000) {
          context.log('[PLAYBACK-STATE-PUT] Debouncing - duplicate update ignored');
          return {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              success: true,
              timestamp: serverTimestamp,
              merged: true,
              message: '중복 업데이트로 무시되었습니다.'
            }
          };
        }

        // 상태 저장
        const timestamp = Date.now();
        const stateToSave = {
          // 기존 필드 (역호환성 유지)
          lastPlayedIndex: clientState.lastPlayedIndex,
          notePath: clientState.notePath || '',
          noteTitle: clientState.noteTitle || '',
          timestamp: timestamp,
          deviceId: clientState.deviceId || 'unknown',

          // 새 필드: 재생 상태
          playbackState: {
            currentTime: clientState.playbackState?.currentTime || 0,
            duration: clientState.playbackState?.duration || 0,
            status: clientState.playbackState?.status || 'stopped',
            lastUpdated: timestamp
          },

          // 새 필드: 재생 설정
          playbackSettings: clientState.playbackSettings || {
            playbackRate: 1.0,
            volume: 100,
            voiceId: 'ko-KR-SunHiNeural'
          },

          // 새 필드: 노트 컨텍스트
          noteContext: clientState.noteContext || {
            contentHash: '',
            folderPath: '',
            dataviewQuery: ''
          },

          // 새 필드: 세션 정보
          sessionInfo: clientState.sessionInfo || {
            sessionId: '',
            deviceType: 'unknown',
            platform: 'unknown',
            appVersion: '5.1.0'
          }
        };

        const content = JSON.stringify(stateToSave, null, 2);
        await blobClient.upload(content, content.length, {
          blobHTTPHeaders: {
            blobContentType: 'application/json',
            blobCacheControl: 'no-cache'
          }
        });

        context.log('[PLAYBACK-STATE-PUT] State saved successfully');

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            success: true,
            timestamp: timestamp,
            conflict: false,
            merged: false
          }
        };

      } catch (error) {
        context.error('[PLAYBACK-STATE-PUT] Failed:', error);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to save playback state',
            message: error.message
          }
        };
      }
    }

    // 지원하지 않는 메서드
    return {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      jsonBody: { error: 'Method not allowed' }
    };
  }
});
