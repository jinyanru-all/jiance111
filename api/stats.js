/**
 * GET /api/stats — 返回分类统计
 */
const fs = require('fs');
const path = require('path');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news.json');

module.exports = (req, res) => {
  let news = [];
  try {
    if (fs.existsSync(NEWS_FILE)) {
      news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
    }
  } catch {
    return res.status(500).json({ error: '读取失败' });
  }

  const stats = { total: news.length, categories: {}, latestUpdate: '' };
  for (const n of news) {
    stats.categories[n.category] = (stats.categories[n.category] || 0) + 1;
    if (n.lastSeen > stats.latestUpdate) stats.latestUpdate = n.lastSeen;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(stats);
};
