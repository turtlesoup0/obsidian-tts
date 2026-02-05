const { app } = require('@azure/functions');
const { getScrollPositionContainer } = require('../../shared/blobHelper');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');

const POSITION_BLOB_NAME = 'scroll-position.json';

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

// GET/PUT /api/scroll-position - 스크롤 위치 동기화
app.http('scroll-position', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'scroll-position',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    const containerClient = await getScrollPositionContainer();

    // GET: 스크롤 위치 조회
    if (request.method === 'GET') {
      try {
        // [SCROLL-GET] 요청 수신 로그
        const requestOrigin = request.headers.get('origin');
        const userAgent = request.headers.get('user-agent');

        context.log('[SCROLL-GET] ========== GET REQUEST START ==========');
        context.log('[SCROLL-GET] Origin:', requestOrigin);
        context.log('[SCROLL-GET] User-Agent:', userAgent);
        context.log('[SCROLL-GET] Timestamp:', new Date().toISOString());

        // 컨테이너 생성 (없으면)
        context.log('[SCROLL-GET] Creating container if not exists...');
        await containerClient.createIfNotExists({ access: 'blob' });
        context.log('[SCROLL-GET] Container ready:', containerClient.containerName);

        const blobClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
        const exists = await blobClient.exists();

        context.log('[SCROLL-GET] Blob exists:', exists);

        if (!exists) {
          context.log('[SCROLL-GET] No scroll position found, returning default');
          return {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              savedNoteName: '',
              savedIndex: -1,
              timestamp: 0,
              deviceId: '',
              _note: 'No saved position found'
            }
          };
        }

        // 스크롤 위치 다운로드
        context.log('[SCROLL-GET] Downloading blob content...');
        const downloadResponse = await blobClient.download();
        const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
        const position = JSON.parse(downloaded.toString());

        context.log('[SCROLL-GET] ========== RETRIEVED SUCCESSFULLY ==========');
        context.log('[SCROLL-GET] Retrieved data:', {
          savedNoteName: position.savedNoteName,
          savedIndex: position.savedIndex,
          timestamp: position.timestamp,
          deviceId: position.deviceId
        });

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: position
        };

      } catch (error) {
        context.error('[SCROLL-GET] ========== GET FAILED ==========');
        context.error('[SCROLL-GET] Error name:', error.name);
        context.error('[SCROLL-GET] Error message:', error.message);
        context.error('[SCROLL-GET] Error stack:', error.stack);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to retrieve scroll position',
            message: error.message
          }
        };
      }
    }

    // PUT: 스크롤 위치 저장
    if (request.method === 'PUT') {
      try {
        // [SCROLL-PUT] 요청 수신 로그
        const requestOrigin = request.headers.get('origin');
        const userAgent = request.headers.get('user-agent');

        context.log('[SCROLL-PUT] ========== PUT REQUEST START ==========');
        context.log('[SCROLL-PUT] Origin:', requestOrigin);
        context.log('[SCROLL-PUT] User-Agent:', userAgent);
        context.log('[SCROLL-PUT] Timestamp:', new Date().toISOString());

        const body = await request.json();
        const { savedNoteName, savedIndex, deviceId } = body;

        // [SCROLL-PUT] 요청 본문 로그 (타입 정보 포함)
        context.log('[SCROLL-PUT] Request body:', {
          savedNoteName: body.savedNoteName,
          savedNoteNameType: typeof body.savedNoteName,
          savedIndex: body.savedIndex,
          savedIndexType: typeof body.savedIndex,
          deviceId: body.deviceId,
          deviceIdType: typeof body.deviceId
        });

        // 입력 검증 (명시적 타입 변환 후)
        const parsedSavedIndex = typeof savedIndex === 'string' ? parseInt(savedIndex, 10) : savedIndex;

        context.log('[SCROLL-PUT] Parsed savedIndex:', {
          original: savedIndex,
          originalType: typeof savedIndex,
          parsed: parsedSavedIndex,
          parsedType: typeof parsedSavedIndex,
          isNaN: isNaN(parsedSavedIndex)
        });

        if (isNaN(parsedSavedIndex) || typeof parsedSavedIndex !== 'number' || parsedSavedIndex < -1) {
          context.error('[SCROLL-PUT] Invalid savedIndex:', savedIndex);
          return {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: {
              error: 'Invalid savedIndex: must be a number >= -1',
              received: savedIndex,
              receivedType: typeof savedIndex
            }
          };
        }

        // 컨테이너 생성 (없으면)
        context.log('[SCROLL-PUT] Creating container if not exists...');
        await containerClient.createIfNotExists({ access: 'blob' });
        context.log('[SCROLL-PUT] Container ready:', containerClient.containerName);

        // 스크롤 위치 데이터 생성
        const timestamp = Date.now();
        const position = {
          savedNoteName: String(savedNoteName || ''),
          savedIndex: parsedSavedIndex,
          timestamp,
          deviceId: String(deviceId || 'unknown')
        };

        context.log('[SCROLL-PUT] Position object created:', {
          savedNoteName: position.savedNoteName,
          savedIndex: position.savedIndex,
          timestamp: position.timestamp,
          deviceId: position.deviceId
        });

        // Blob에 저장
        const blobClient = containerClient.getBlockBlobClient(POSITION_BLOB_NAME);
        const content = JSON.stringify(position, null, 2);

        context.log('[SCROLL-PUT] Attempting blob upload...');
        context.log('[SCROLL-PUT] Blob name:', POSITION_BLOB_NAME);
        context.log('[SCROLL-PUT] Content length:', content.length);
        context.log('[SCROLL-PUT] Content preview:', content.substring(0, 200));

        // 업로드 수행
        const uploadResult = await blobClient.upload(content, content.length, {
          blobHTTPHeaders: {
            blobContentType: 'application/json',
            blobCacheControl: 'no-cache'
          }
        });

        // [SCROLL-PUT] 업로드 결과 검증
        context.log('[SCROLL-PUT] Upload completed. Result:', {
          etag: uploadResult.etag,
          lastModified: uploadResult.lastModified,
          contentMD5: uploadResult.contentMD5,
          version: uploadResult.version,
          requestId: uploadResult.requestId
        });

        // ETag 검증 (업로드 성공 확인)
        if (!uploadResult.etag) {
          context.error('[SCROLL-PUT] Upload failed: no ETag returned');
          throw new Error('Blob upload failed: no ETag returned from Azure Storage');
        }

        // [SCROLL-PUT] 업로드 후 즉시 읽기 검증 (Read-Back Verification)
        context.log('[SCROLL-PUT] Verifying upload by reading back...');
        const verifyClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
        const verifyResponse = await verifyClient.download();

        if (!verifyResponse.readableStreamBody) {
          context.error('[SCROLL-PUT] Verification failed: no readable stream');
          throw new Error('Blob upload verification failed: could not read back uploaded data');
        }

        const verifyBuffer = await streamToBuffer(verifyResponse.readableStreamBody);
        const verifyContent = verifyBuffer.toString();

        context.log('[SCROLL-PUT] Verification content length:', verifyContent.length);
        context.log('[SCROLL-PUT] Verification content preview:', verifyContent.substring(0, 200));

        // 업로드한 내용과 읽어온 내용 비교
        if (verifyContent !== content) {
          context.error('[SCROLL-PUT] Verification failed: content mismatch');
          context.error('[SCROLL-PUT] Expected length:', content.length);
          context.error('[SCROLL-PUT] Actual length:', verifyContent.length);
          throw new Error('Blob upload verification failed: content mismatch after upload');
        }

        // JSON 파싱 검증
        let verifyParsed;
        try {
          verifyParsed = JSON.parse(verifyContent);
        } catch (parseError) {
          context.error('[SCROLL-PUT] Verification failed: invalid JSON');
          throw new Error('Blob upload verification failed: uploaded data is not valid JSON');
        }

        // 데이터 값 검증
        if (
          verifyParsed.savedNoteName !== position.savedNoteName ||
          verifyParsed.savedIndex !== position.savedIndex ||
          verifyParsed.deviceId !== position.deviceId
        ) {
          context.error('[SCROLL-PUT] Verification failed: value mismatch');
          context.error('[SCROLL-PUT] Expected:', position);
          context.error('[SCROLL-PUT] Actual:', verifyParsed);
          throw new Error('Blob upload verification failed: data values do not match');
        }

        context.log('[SCROLL-PUT] ========== UPLOAD VERIFIED SUCCESSFULLY ==========');
        context.log('[SCROLL-PUT] Final saved data:', verifyParsed);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            success: true,
            timestamp,
            verified: true,
            etag: uploadResult.etag,
            data: verifyParsed
          }
        };

      } catch (error) {
        context.error('[SCROLL-PUT] ========== UPLOAD FAILED ==========');
        context.error('[SCROLL-PUT] Error name:', error.name);
        context.error('[SCROLL-PUT] Error message:', error.message);
        context.error('[SCROLL-PUT] Error stack:', error.stack);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to save scroll position',
            message: error.message,
            errorName: error.name
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
