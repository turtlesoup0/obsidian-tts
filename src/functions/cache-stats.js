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

// GET /api/cache-stats - 전체 캐시 통계 조회
app.http('cache-stats', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache-stats',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    try {
      context.log('Cache stats request');

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
            totalFiles: 0,
            totalSize: 0,
            oldestFile: null,
            newestFile: null
          }
        };
      }

      // 통계 변수 초기화
      let totalFiles = 0;
      let totalSize = 0;
      let oldestFile = null;
      let newestFile = null;

      // 스트리밍 방식으로 blob 통계 계산 (메모리 효율적)
      for await (const blob of containerClient.listBlobsFlat()) {
        totalFiles++;
        totalSize += blob.properties.contentLength || 0;

        const blobInfo = {
          name: blob.name,
          createdOn: blob.properties.createdOn
        };

        // oldest 파일 업데이트
        if (!oldestFile || blob.properties.createdOn < oldestFile.createdOn) {
          oldestFile = blobInfo;
        }

        // newest 파일 업데이트
        if (!newestFile || blob.properties.createdOn > newestFile.createdOn) {
          newestFile = blobInfo;
        }
      }

      context.log(`Cache stats: ${totalFiles} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

      return {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        jsonBody: {
          totalFiles,
          totalSize,
          totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
          oldestFile,
          newestFile
        }
      };

    } catch (error) {
      context.error('Cache stats error:', error);
      return {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get cache stats',
          message: error.message
        }
      };
    }
  }
});
