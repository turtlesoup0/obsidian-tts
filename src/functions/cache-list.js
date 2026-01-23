const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');

function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

// GET /api/cache-list - 캐시 키 목록 조회 (디버깅용)
app.http('cache-list', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache-list',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    try {
      const limit = parseInt(request.query.get('limit') || '100', 10);
      const offset = parseInt(request.query.get('offset') || '0', 10);

      context.log(`Cache list request: limit=${limit}, offset=${offset}`);

      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient('tts-cache');

      // 컨테이너 존재 확인
      const exists = await containerClient.exists();
      if (!exists) {
        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            cacheKeys: [],
            total: 0,
            offset: offset,
            limit: limit
          }
        };
      }

      // 캐시 키 목록 수집
      const cacheKeys = [];
      let count = 0;

      for await (const blob of containerClient.listBlobsFlat()) {
        // offset 건너뛰기
        if (count < offset) {
          count++;
          continue;
        }

        // limit 도달 시 중단
        if (cacheKeys.length >= limit) {
          break;
        }

        // .mp3 확장자 제거하여 캐시 키만 추출
        const cacheKey = blob.name.replace(/\.mp3$/, '');
        cacheKeys.push({
          key: cacheKey,
          size: blob.properties.contentLength,
          createdOn: blob.properties.createdOn
        });

        count++;
      }

      context.log(`Returning ${cacheKeys.length} cache keys`);

      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        jsonBody: {
          cacheKeys,
          total: count,
          offset: offset,
          limit: limit
        }
      };

    } catch (error) {
      context.error('Cache list error:', error);
      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to list cache keys',
          message: error.message
        }
      };
    }
  }
});
