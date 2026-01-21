/**
 * Azure Function: TTS Cache Management
 * Azure Blob Storage를 사용한 서버 공유 캐싱
 */

const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

const CONTAINER_NAME = 'tts-cache';
const CACHE_TTL_DAYS = 30;

function getBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
  }
  return BlobServiceClient.fromConnectionString(connectionString);
}

// GET /api/cache/{hash} - 캐시 조회
app.http('cache-get', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache/{hash}',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      };
    }

    const hash = request.params.hash;

    try {
      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      const blobClient = containerClient.getBlobClient(`${hash}.mp3`);

      const exists = await blobClient.exists();
      if (!exists) {
        return {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Cache not found' }
        };
      }

      // 메타데이터 확인 (TTL)
      const properties = await blobClient.getProperties();
      const cachedAt = new Date(properties.metadata?.cachedAt || properties.createdOn);
      const expiresAt = new Date(cachedAt.getTime() + CACHE_TTL_DAYS * 24 * 3600 * 1000);
      const now = new Date();

      if (now >= expiresAt) {
        // 만료된 캐시 삭제
        await blobClient.delete();
        return {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          jsonBody: { error: 'Cache expired' }
        };
      }

      // 캐시 다운로드
      const downloadResponse = await blobClient.download();
      const audioBuffer = await streamToBuffer(downloadResponse.readableStreamBody);

      context.log(`Cache hit: ${hash}, size: ${audioBuffer.length} bytes`);

      return {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'X-Cache-Status': 'HIT',
          'X-Cached-At': cachedAt.toISOString(),
          'X-Expires-At': expiresAt.toISOString(),
          'Cache-Control': 'public, max-age=2592000' // 30 days
        },
        body: audioBuffer
      };

    } catch (error) {
      context.error('Cache get error:', error);
      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to get cache',
          details: error.message
        }
      };
    }
  }
});

// PUT /api/cache/{hash} - 캐시 저장
app.http('cache-put', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache/{hash}',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') {
      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      };
    }

    const hash = request.params.hash;

    try {
      const audioBuffer = Buffer.from(await request.arrayBuffer());

      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
      
      // Container가 없으면 생성
      await containerClient.createIfNotExists({ access: 'blob' });

      const blobClient = containerClient.getBlockBlobClient(`${hash}.mp3`);

      // 메타데이터 포함하여 업로드
      const cachedAt = new Date().toISOString();
      await blobClient.upload(audioBuffer, audioBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'audio/mpeg',
          blobCacheControl: 'public, max-age=2592000'
        },
        metadata: {
          cachedAt: cachedAt,
          ttlDays: CACHE_TTL_DAYS.toString()
        }
      });

      context.log(`Cache saved: ${hash}, size: ${audioBuffer.length} bytes`);

      return {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          success: true,
          hash: hash,
          size: audioBuffer.length,
          cachedAt: cachedAt
        }
      };

    } catch (error) {
      context.error('Cache put error:', error);
      return {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Failed to save cache',
          details: error.message
        }
      };
    }
  }
});

// Helper function
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}
