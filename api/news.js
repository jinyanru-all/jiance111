/**
 * GET /api/news — 返回联盟数据
 * 数据由 GitHub Actions 每 5 分钟自动更新到 data/news.json
 */
const fs = require('fs');
const path = require('path');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news.json');

module.exports = (req, res) => {
  const { search, category } = req.query;
  let news = [];

  try {
    if (fs.existsSync(NEWS_FILE)) {
      news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
    }
  } catch {
    return res.status(500).json({ error: '读取数据失败' });
  }

  if (category && category !== 'all') {
    news = news.filter(n => n.category === category);
  }
  if (search && search.trim()) {
    const kw = search.trim().toLowerCase();
    news = news.filter(n =>
      (n.title && n.title.toLowerCase().includes(kw)) ||
      (n.org && n.org.toLowerCase().includes(kw)) ||
      (n.chair && n.chair.toLowerCase().includes(kw))
    );
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(news);
};
