/**
 * Usage Tracker - 파일 기반 사용량 추적
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.HOME ? path.join(process.env.HOME, 'data') : '/tmp';
const USAGE_FILE = path.join(DATA_DIR, 'tts-usage.json');

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
  const usage = await readUsage();
  usage.totalChars += charsUsed;
  await writeUsage(usage);
  return usage;
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
