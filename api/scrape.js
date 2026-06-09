/**
 * POST /api/scrape — 手动触发抓取（仅线上 Vercel 环境生效）
 * -------------------------------------------------------
 * 设置 CRON_SECRET 后，前端点击"手动抓取"会直接触发 api/cron 执行。
 * 未设置则提示用户等待自动定时执行。
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.json({
      status: 'auto',
      message: '线上抓取由 Vercel Cron 每 5 分钟自动执行，稍后刷新即可。',
    });
  }

  // 直接调用 api/cron 的逻辑
  try {
    const { fetchAllCategories, mergeNews } = require('../lib/scraper');
    const { put, list } = require('@vercel/blob');

    const BLOB_PREFIX = 'news-data/';
    const NEWS_KEY = BLOB_PREFIX + 'news.json';
    const SEEN_KEY = BLOB_PREFIX + 'seen.json';

    // 读取已有数据
    let existingNewsArr = null, existingSeenArr = null;
    try {
      const [newsList, seenList] = await Promise.all([
        list({ prefix: NEWS_KEY, limit: 1 }),
        list({ prefix: SEEN_KEY, limit: 1 }),
      ]);
      if (newsList.blobs.length > 0) {
        const resp = await fetch(newsList.blobs[0].url);
        existingNewsArr = await resp.json();
      }
      if (seenList.blobs.length > 0) {
        const resp = await fetch(seenList.blobs[0].url);
        existingSeenArr = await resp.json();
      }
    } catch {}

    const existingMap = new Map();
    if (existingNewsArr) for (const item of existingNewsArr) existingMap.set(item.url, item);
    const seenSet = new Set(existingSeenArr || []);

    // 抓取 + 合并
    const allNews = await fetchAllCategories(true);
    const { merged: newMap } = mergeNews(allNews, existingMap);
    for (const items of allNews.values()) {
      for (const item of items) seenSet.add(item.url);
    }

    // 写入 Blob
    const newsArr = [...newMap.values()].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    await Promise.all([
      put(NEWS_KEY, JSON.stringify(newsArr), { access: 'public', contentType: 'application/json' }),
      put(SEEN_KEY, JSON.stringify([...seenSet]), { access: 'public', contentType: 'application/json' }),
    ]);

    return res.json({ status: 'done', total: newsArr.length, message: '抓取完成' });
  } catch (err) {
    return res.json({ status: 'error', message: '抓取失败: ' + err.message });
  }
};
