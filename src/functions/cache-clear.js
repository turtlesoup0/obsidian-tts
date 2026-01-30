const { app } = require('@azure/functions');

const { getTTSCacheContainer } = require('../../shared/blobHelper');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');



// DELETE /api/cache-clear - 전체 캐시 삭제
// 🔒 보안: Function 레벨 인증 필요 (관리자 작업)
app.http('cache-clear', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'function',  // Function Key 필요
  route: 'cache-clear',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    try {
      context.log('Cache clear request - deleting all cache');

      const containerClient = await getTTSCacheContainer();
      

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
            deletedCount: 0,
            message: 'Container does not exist'
          }
        };
      }

      // 모든 blob 삭제
      let deletedCount = 0;
      for await (const blob of containerClient.listBlobsFlat()) {
        await containerClient.deleteBlob(blob.name);
        deletedCount++;
      }

      context.log(`Cache cleared: ${deletedCount} blobs deleted`);

      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          success: true,
          deletedCount: deletedCount,
          message: `Successfully deleted ${deletedCount} cache files`
        }
      };

    } catch (error) {
      context.error('Cache clear error:', error);
      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to clear cache',
          message: error.message
        }
      };
    }
  }
});
