/**
 * 联盟新闻监测器（本地 / CI 模式）
 * ===================================
 * 本地使用:  node monitor.js           # 持续运行，每 5 分钟抓取
 * CI 使用:   node monitor.js --once    # 单次抓取后退出
 *
 * 数据写入 data/news.json 和 data/seen.json
 */

const fs = require('fs');
const path = require('path');
const { fetchAllCategories, mergeNews } = require('./lib/scraper');

// ===================== 配置 =====================

const INTERVAL_MS = 5 * 60 * 1000;
const SEEN_FILE = path.join(__dirname, 'data', 'seen.json');
const NEWS_FILE = path.join(__dirname, 'data', 'news.json');
const LOG_FILE = path.join(__dirname, 'log', 'new-news.log');

// ===================== 工具函数 =====================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function log(msg) {
  console.log(`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${msg}`);
}

function appendLog(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf-8');
}

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    log(`⚠ 读取 ${filePath} 失败: ${err.message}`);
  }
  return null;
}

function saveJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ===================== 核心逻辑 =====================

async function runOnce() {
  try {
    log('══════════════ 开始新一轮监测 ══════════════');

    // 读取已有数据
    const existingArr = loadJSON(NEWS_FILE) || [];
    const existingMap = new Map();
    for (const item of existingArr) existingMap.set(item.url, item);

    const seenArr = loadJSON(SEEN_FILE) || [];
    const seenSet = new Set(seenArr);

    // 抓取
    const allNews = await fetchAllCategories(process.argv.includes('--verbose'));
    for (const [cat, items] of allNews) {
      log(`  ${cat}: ${items.length} 条`);
    }

    // 合并
    const { merged: newMap, newUrls } = mergeNews(allNews, existingMap);

    // 更新 seen
    for (const items of allNews.values()) {
      for (const item of items) seenSet.add(item.url);
    }

    // 导出数组（按日期降序）
    const newsArr = [...newMap.values()].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    // 持久化
    saveJSON(NEWS_FILE, newsArr);
    saveJSON(SEEN_FILE, [...seenSet]);

    // 输出新增
    if (newUrls.length > 0) {
      log(`🆕 发现 ${newUrls.length} 条新增联盟:`);
      const lines = [];
      const ts = new Date().toISOString();
      for (const url of newUrls) {
        const item = newMap.get(url);
        console.log(`  [${item.category}] ${item.title}`);
        console.log(`    链接: ${item.url}  启动: ${item.date}  单位: ${item.org}`);
        console.log('');
        lines.push(`--- ${ts} ---`, `类别: ${item.category}`, `名称: ${item.title}`,
          `链接: ${item.url}`, `启动时间: ${item.date}`,
          item.org ? `牵头单位: ${item.org}` : '', item.chair ? `理事长: ${item.chair}` : '', '');
      }
      appendLog(LOG_FILE, lines.join('\n'));
    } else {
      log('✅ 无新增联盟条目');
    }

    log(`news.json 已更新（共 ${newsArr.length} 条）`);
    log('══════════════ 本轮结束 ══════════════\n');
  } catch (err) {
    log(`❌ 监测出错: ${err.message}`);
    if (process.argv.includes('--verbose')) console.error(err);
  }
}

// ===================== 入口 =====================

const args = process.argv.slice(2);

if (args.includes('--once')) {
  runOnce().then(() => { log('单次运行完成，进程退出。'); process.exit(0); });
} else {
  log('🚀 联盟新闻监测器已启动（每 5 分钟抓取）');
  runOnce();
  setInterval(runOnce, INTERVAL_MS);
}
