/**
 * Vercel Cron: 每 5 分钟自动执行抓取
 * ======================================
 * 由 vercel.json 中的 cron 配置触发。
 * 数据持久化到 Vercel Blob（跨 Serverless 实例共享）。
 *
 * 注意：首次部署后，需要在 Vercel Dashboard → Storage → Blob 中创建 Blob Store。
 */

const { put, list, del } = require('@vercel/blob');
const { fetchAllCategories, mergeNews } = require('../lib/scraper');

const BLOB_PREFIX = 'news-data/';
const NEWS_KEY = BLOB_PREFIX + 'news.json';
const SEEN_KEY = BLOB_PREFIX + 'seen.json';
const LOG_KEY = BLOB_PREFIX + 'log.txt';

/** 读 Blob（返回解析后的 JSON，失败返回 null） */
async function readBlobJSON(key) {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    if (blobs.length === 0) return null;
    const resp = await fetch(blobs[0].url);
    return await resp.json();
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Vercel Cron 会带一个 x-vercel-cron 头
  const isCron = req.headers['x-vercel-cron'] === '1';

  // 只允许 cron 或手动 POST（带简单 token）
  if (!isCron && req.method !== 'POST') {
    return res.status(405).json({ error: '仅允许 cron 或 POST' });
  }

  // 简单鉴权（手动触发时检查）
  if (!isCron) {
    const auth = req.headers['authorization'] || '';
    const expectedToken = process.env.CRON_SECRET || 'changeme';
    if (auth !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ error: '未授权' });
    }
  }

  console.log(`[Cron] 开始抓取 (触发方式: ${isCron ? '定时' : '手动'})...`);

  try {
    // 1. 读取已有数据
    const [existingNewsArr, existingSeenArr] = await Promise.all([
      readBlobJSON(NEWS_KEY),
      readBlobJSON(SEEN_KEY),
    ]);

    const existingMap = new Map();
    if (existingNewsArr) {
      for (const item of existingNewsArr) existingMap.set(item.url, item);
    }
    const seenSet = new Set(existingSeenArr || []);

    console.log(`[Cron] 已有 ${existingMap.size} 条记录，${seenSet.size} 个已见 URL`);

    // 2. 执行抓取
    const allNews = await fetchAllCategories(true);

    // 3. 合并
    const { merged: newMap, newUrls } = mergeNews(allNews, existingMap);

    // 4. 更新 seen
    for (const items of allNews.values()) {
      for (const item of items) {
        seenSet.add(item.url);
      }
    }

    // 5. 写入 Blob
    const newsArr = [...newMap.values()].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    const now = new Date().toISOString();
    let logLine = `--- ${now} ---\n抓取完成: 共 ${newsArr.length} 条记录`;
    if (newUrls.length > 0) {
      logLine += `\n🆕 新增 ${newUrls.length} 条:\n` + newUrls.join('\n');
    } else {
      logLine += `\n✅ 无新增`;
    }
    logLine += '\n\n';

    // 同时写入 news.json、seen.json、追加日志
    await Promise.all([
      put(NEWS_KEY, JSON.stringify(newsArr), { access: 'public', contentType: 'application/json' }),
      put(SEEN_KEY, JSON.stringify([...seenSet]), { access: 'public', contentType: 'application/json' }),
      put(LOG_KEY + '?' + Date.now(), logLine, { access: 'public', contentType: 'text/plain' })
        .catch(() => {}), // 日志写入失败不报错
    ]);

    console.log(`[Cron] 完成: 共 ${newsArr.length} 条，新增 ${newUrls.length}`);

    return res.json({
      ok: true,
      total: newsArr.length,
      new: newUrls.length,
      newUrls,
    });
  } catch (err) {
    console.error(`[Cron] 失败:`, err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
