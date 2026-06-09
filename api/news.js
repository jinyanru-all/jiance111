/**
 * GET /api/news — 返回联盟数据（搜索 + 分类过滤）
 * --------------------------------------------
 * 线上环境：从 Vercel Blob 读取（跨实例共享）
 * 本地开发：从 data/news.json 读取
 */

const fs = require('fs');
const path = require('path');

const NEWS_FILE = path.join(__dirname, '..', 'data', 'news.json');
const BLOB_NEWS_URL = process.env.BLOB_NEWS_URL; // Vercel 部署时设置（指向 Blob 的公开 URL）

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { search, category } = req.query;
  let news = [];

  try {
    // 优先从 Blob URL 读取（线上环境），失败则回退到本地文件
    if (BLOB_NEWS_URL) {
      const resp = await fetch(BLOB_NEWS_URL);
      if (resp.ok) {
        news = await resp.json();
      }
    }

    if (news.length === 0) {
      // 本地文件兜底
      if (fs.existsSync(NEWS_FILE)) {
        news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
      }
    }
  } catch (err) {
    return res.status(500).json({ error: '读取数据失败', detail: err.message });
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

  res.status(200).json(news);
};
