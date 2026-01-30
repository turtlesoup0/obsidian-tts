/**
 * Azure Blob Storage 공통 유틸리티
 *
 * 여러 Azure Functions에서 공통으로 사용하는 Blob Storage 헬퍼
 */

const { BlobServiceClient } = require('@azure/storage-blob');
const configLoader = require('./configLoader');

/**
 * Blob Service Client 인스턴스 생성
 * config.properties 또는 환경 변수에서 연결 문자열 로드
 *
 * @returns {Promise<BlobServiceClient>} Blob Storage 클라이언트
 * @throws {Error} 연결 문자열이 설정되지 않은 경우
 */
async function getBlobServiceClient() {
  // config.properties 로드 (최초 1회)
  if (!configLoader.config) {
    await configLoader.load();
  }

  const connectionString = configLoader.get('AZURE_STORAGE_CONNECTION_STRING');

  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not set in config.properties or environment');
  }

  return BlobServiceClient.fromConnectionString(connectionString);
}

/**
 * TTS 캐시 컨테이너 클라이언트 가져오기
 *
 * @returns {Promise<ContainerClient>} 'tts-cache' 컨테이너 클라이언트
 */
async function getTTSCacheContainer() {
  const blobServiceClient = await getBlobServiceClient();

  if (!configLoader.config) {
    await configLoader.load();
  }

  const containerName = configLoader.get('AZURE_BLOB_CONTAINER_NAME', 'tts-cache');
  return blobServiceClient.getContainerClient(containerName);
}

/**
 * 재생 위치 동기화 컨테이너 클라이언트 가져오기
 *
 * @returns {Promise<ContainerClient>} 'tts-playback' 컨테이너 클라이언트
 */
async function getPlaybackPositionContainer() {
  const blobServiceClient = await getBlobServiceClient();
  return blobServiceClient.getContainerClient('tts-playback');
}

/**
 * 스크롤 위치 동기화 컨테이너 클라이언트 가져오기
 *
 * @returns {Promise<ContainerClient>} 'scroll-position' 컨테이너 클라이언트
 */
async function getScrollPositionContainer() {
  const blobServiceClient = await getBlobServiceClient();
  return blobServiceClient.getContainerClient('scroll-position');
}

module.exports = {
  getBlobServiceClient,
  getTTSCacheContainer,
  getPlaybackPositionContainer,
  getScrollPositionContainer
};
