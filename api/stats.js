/**
 * GET /api/stats — 返回分类统计
 */

const fs = require('fs');
const path = require('path');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news.json');
const BLOB_NEWS_URL = process.env.BLOB_NEWS_URL;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let news = [];

  try {
    if (BLOB_NEWS_URL) {
      const resp = await fetch(BLOB_NEWS_URL);
      if (resp.ok) news = await resp.json();
    }
    if (news.length === 0 && fs.existsSync(NEWS_FILE)) {
      news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
    }
  } catch {
    return res.status(500).json({ error: '读取失败' });
  }

  const stats = {
    total: news.length,
    categories: {},
    latestUpdate: news.length > 0
      ? news.reduce((max, n) => (n.lastSeen > max ? n.lastSeen : max), news[0].lastSeen || '')
      : '',
  };

  for (const n of news) {
    stats.categories[n.category] = (stats.categories[n.category] || 0) + 1;
  }

  res.status(200).json(stats);
};
