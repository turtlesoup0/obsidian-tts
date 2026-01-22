const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

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
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      };
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
            'Access-Control-Allow-Origin': '*',
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

      // 모든 blob 나열
      const blobs = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength,
          createdOn: blob.properties.createdOn,
          lastModified: blob.properties.lastModified
        });
      }

      // 통계 계산
      const totalFiles = blobs.length;
      const totalSize = blobs.reduce((sum, blob) => sum + blob.size, 0);
      const sortedByDate = [...blobs].sort((a, b) => a.createdOn - b.createdOn);
      const oldestFile = sortedByDate.length > 0 ? {
        name: sortedByDate[0].name,
        createdOn: sortedByDate[0].createdOn
      } : null;
      const newestFile = sortedByDate.length > 0 ? {
        name: sortedByDate[sortedByDate.length - 1].name,
        createdOn: sortedByDate[sortedByDate.length - 1].createdOn
      } : null;

      context.log(`Cache stats: ${totalFiles} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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
