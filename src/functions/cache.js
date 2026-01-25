const { app } = require('@azure/functions');
const { getCorsHeaders, handleCorsPreflightResponse } = require('../../shared/corsHelper');
const { getTTSCacheContainer } = require('../../shared/blobHelper');

const CACHE_TTL_DAYS = 30;

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

// Combined GET/PUT /api/cache/{hash}
app.http('cache', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'cache/{hash}',
  handler: async (request, context) => {
    const requestOrigin = request.headers.get('origin');
    const corsHeaders = getCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightResponse(requestOrigin);
    }

    const hash = request.params.hash;

    // Handle GET request
    if (request.method === 'GET') {
      try {
        context.log(`Cache GET: ${hash}`);

        const containerClient = await getTTSCacheContainer();
        const blobClient = containerClient.getBlobClient(`${hash}.mp3`);

        const exists = await blobClient.exists();
        if (!exists) {
          context.log(`Cache miss: ${hash}`);
          return {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { error: 'Cache not found' }
          };
        }

        // TTL 체크
        const properties = await blobClient.getProperties();
        const cachedAt = properties.metadata?.cachedAt
          ? new Date(properties.metadata.cachedAt)
          : properties.createdOn;

        const expiresAt = new Date(cachedAt.getTime() + CACHE_TTL_DAYS * 24 * 3600 * 1000);

        if (new Date() >= expiresAt) {
          context.log(`Cache expired: ${hash}`);
          await blobClient.delete();
          return {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { error: 'Cache expired' }
          };
        }

        // 다운로드
        const downloadResponse = await blobClient.download();
        const audioBuffer = await streamToBuffer(downloadResponse.readableStreamBody);

        context.log(`Cache hit: ${hash}, ${audioBuffer.length} bytes`);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'audio/mpeg',
            'X-Cache-Status': 'HIT',
            'X-Cached-At': cachedAt.toISOString(),
            'X-Expires-At': expiresAt.toISOString()
          },
          body: audioBuffer
        };

      } catch (error) {
        context.error('Cache GET error:', error);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Cache retrieval failed',
            message: error.message
          }
        };
      }
    }

    // Handle PUT request
    if (request.method === 'PUT') {
      try {
        context.log(`Cache PUT: ${hash}`);

        const audioBuffer = Buffer.from(await request.arrayBuffer());

        if (!audioBuffer || audioBuffer.length === 0) {
          return {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            },
            jsonBody: { error: 'Empty audio data' }
          };
        }

        const containerClient = await getTTSCacheContainer();

        // Container 생성 (없으면)
        await containerClient.createIfNotExists({ access: 'blob' });

        const blobClient = containerClient.getBlockBlobClient(`${hash}.mp3`);

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

        context.log(`Cache saved: ${hash}, ${audioBuffer.length} bytes`);

        return {
          status: 200,
          headers: {
            ...corsHeaders,
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
        context.error('Cache PUT error:', error);
        return {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          jsonBody: {
            error: 'Failed to save cache',
            details: error.message
          }
        };
      }
    }

    // Unsupported method
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
