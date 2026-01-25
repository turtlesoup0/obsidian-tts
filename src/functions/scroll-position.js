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
        context.log('Scroll position GET request');

        // 컨테이너 생성 (없으면)
        await containerClient.createIfNotExists({ access: 'blob' });

        const blobClient = containerClient.getBlobClient(POSITION_BLOB_NAME);
        const exists = await blobClient.exists();

        if (!exists) {
          context.log('No scroll position found');
          return {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { savedNoteName: '', savedIndex: -1 }
          };
        }

        // 스크롤 위치 다운로드
        const downloadResponse = await blobClient.download();
        const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
        const position = JSON.parse(downloaded.toString());

        context.log(`Scroll position retrieved: name=${position.savedNoteName}, index=${position.savedIndex}, device=${position.deviceId}`);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: position
        };

      } catch (error) {
        context.error('Failed to get scroll position:', error);
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
        const body = await request.json();
        const { savedNoteName, savedIndex, deviceId } = body;

        context.log(`Scroll position PUT request: name=${savedNoteName}, index=${savedIndex}, device=${deviceId}`);

        // 입력 검증
        if (typeof savedIndex !== 'number' || savedIndex < -1) {
          return {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { error: 'Invalid savedIndex: must be a number >= -1' }
          };
        }

        // 컨테이너 생성 (없으면)
        await containerClient.createIfNotExists({ access: 'blob' });

        // 스크롤 위치 데이터 생성
        const timestamp = Date.now();
        const position = {
          savedNoteName: savedNoteName || '',
          savedIndex,
          timestamp,
          deviceId: deviceId || 'unknown'
        };

        // Blob에 저장
        const blobClient = containerClient.getBlockBlobClient(POSITION_BLOB_NAME);
        const content = JSON.stringify(position, null, 2);

        await blobClient.upload(content, content.length, {
          blobHTTPHeaders: {
            blobContentType: 'application/json',
            blobCacheControl: 'no-cache'
          }
        });

        context.log(`Scroll position saved: name="${savedNoteName}", index=${savedIndex}, device=${deviceId}`);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            success: true,
            timestamp
          }
        };

      } catch (error) {
        context.error('Failed to save scroll position:', error);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to save scroll position',
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
