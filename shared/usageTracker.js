/**
 * Usage Tracker - 파일 기반 사용량 추적 (파일 잠금 지원)
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.HOME ? path.join(process.env.HOME, 'data') : '/tmp';
const USAGE_FILE = path.join(DATA_DIR, 'tts-usage.json');
const LOCK_FILE = path.join(DATA_DIR, 'tts-usage.lock');

// 파일 잠금 타임아웃 (5초)
const LOCK_TIMEOUT = 5000;
const LOCK_RETRY_DELAY = 50;

/**
 * 파일 잠금 획득 (재시도 로직 포함)
 */
async function acquireLock() {
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT) {
    try {
      // 잠금 파일 생성 (이미 존재하면 실패)
      await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // 잠금 파일이 이미 존재 - 잠금 파일 나이 확인
        try {
          const stats = await fs.stat(LOCK_FILE);
          const age = Date.now() - stats.mtimeMs;

          // 오래된 잠금 파일(10초 이상)은 제거 (stale lock)
          if (age > 10000) {
            await fs.unlink(LOCK_FILE);
            continue;
          }
        } catch (statError) {
          // 잠금 파일이 삭제된 경우 재시도
          continue;
        }

        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Failed to acquire lock: timeout');
}

/**
 * 파일 잠금 해제
 */
async function releaseLock() {
  try {
    await fs.unlink(LOCK_FILE);
  } catch (error) {
    // 잠금 파일이 이미 삭제된 경우 무시
    if (error.code !== 'ENOENT') {
      console.error('Failed to release lock:', error);
    }
  }
}

function createUsageData() {
  const now = new Date();
  return {
    totalChars: 0,
    currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    lastUpdated: now.toISOString(),
    history: []
  };
}

async function readUsage() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(USAGE_FILE, 'utf8');
    const usage = JSON.parse(data);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (usage.currentMonth !== currentMonth) {
      usage.history.push({
        month: usage.currentMonth,
        totalChars: usage.totalChars
      });
      usage.totalChars = 0;
      usage.currentMonth = currentMonth;
    }

    return usage;
  } catch (error) {
    return createUsageData();
  }
}

async function writeUsage(usage) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    usage.lastUpdated = new Date().toISOString();
    await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write usage file:', error);
    return false;
  }
}

async function addUsage(charsUsed) {
  // 입력 검증
  if (typeof charsUsed !== 'number' || charsUsed < 0 || !Number.isFinite(charsUsed)) {
    throw new Error('Invalid charsUsed: must be a positive finite number');
  }

  let lockAcquired = false;
  try {
    // 파일 잠금 획득
    await acquireLock();
    lockAcquired = true;

    // 파일 읽기
    const usage = await readUsage();

    // 업데이트
    usage.totalChars += charsUsed;

    // 파일 쓰기
    await writeUsage(usage);

    return usage;
  } finally {
    // 잠금 해제 (반드시 실행)
    if (lockAcquired) {
      await releaseLock();
    }
  }
}

async function getUsage() {
  return await readUsage();
}

async function resetUsage() {
  const usage = createUsageData();
  await writeUsage(usage);
  return usage;
}

module.exports = {
  addUsage,
  getUsage,
  resetUsage
};
