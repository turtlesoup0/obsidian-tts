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

// DELETE /api/cache-clear - 전체 캐시 삭제
app.http('cache-clear', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
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
