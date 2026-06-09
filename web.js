/**
 * 联盟新闻 Web 面板
 * ==================
 * 提供实时查看和搜索已抓取联盟数据的 Web 界面。
 * 默认绑定所有网卡，同一局域网内的同事可直接通过 IP 访问。
 *
 * 用法:
 *   node web.js                  # 默认端口 3000，绑定 0.0.0.0
 *   PORT=8080 node web.js        # 自定义端口
 *
 * 局域网访问:
 *   先在本机查看 IP（启动时会自动打印），同事打开 http://<你的IP>:3000 即可
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const app = express();

// ===================== 配置 =====================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';  // 0.0.0.0 = 允许局域网 / VPN 访问
const NEWS_FILE = path.join(__dirname, 'data', 'news.json');

// ===================== 中间件 =====================

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== API =====================

/** GET /api/news — 返回全部联盟数据，支持搜索和分类过滤 */
app.get('/api/news', (req, res) => {
  const { search, category } = req.query;
  let news = [];

  try {
    if (fs.existsSync(NEWS_FILE)) {
      news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
    }
  } catch (err) {
    return res.status(500).json({ error: '读取 news.json 失败', detail: err.message });
  }

  // 分类过滤
  if (category && category !== 'all') {
    news = news.filter(n => n.category === category);
  }

  // 搜索（匹配标题、牵头单位、理事长）
  if (search && search.trim()) {
    const kw = search.trim().toLowerCase();
    news = news.filter(n =>
      (n.title && n.title.toLowerCase().includes(kw)) ||
      (n.org && n.org.toLowerCase().includes(kw)) ||
      (n.chair && n.chair.toLowerCase().includes(kw))
    );
  }

  res.json(news);
});

/** GET /api/stats — 返回统计摘要 */
app.get('/api/stats', (req, res) => {
  let news = [];
  try {
    if (fs.existsSync(NEWS_FILE)) {
      news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
    }
  } catch (err) {
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

  res.json(stats);
});

/** POST /api/scrape — 触发一次即时抓取（启动子进程，不阻塞） */
app.post('/api/scrape', async (req, res) => {
  res.json({ status: 'started', message: '抓取已触发，请稍后刷新' });

  // 启动子进程执行 monitor.js --once，复用已有抓取逻辑
  exec(`node "${path.join(__dirname, 'monitor.js')}" --once`, (err, stdout, stderr) => {
    if (err) {
      console.error(`[Web] 手动抓取失败: ${err.message}`);
      if (stderr) console.error(stderr);
    } else {
      console.log('[Web] 手动抓取完成');
      if (stderr) console.error(stderr);
    }
  });
});

/**
 * 获取本机局域网 IP 列表（IPv4，排除 127.x 和 Docker/虚拟网卡）
 */
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    // 跳过虚拟网卡、Docker、VMware 等
    if (/virtual|docker|vmware|vbox|hyper-v|loopback|bluetooth/i.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ name, ip: addr.address });
      }
    }
  }
  return ips;
}

// ===================== 启动 =====================

app.listen(PORT, HOST, () => {
  console.log('══════════════════════════════════════════');
  console.log('  联盟新闻 Web 面板已启动');
  console.log(`  本机访问: http://localhost:${PORT}`);

  const ips = getLocalIPs();
  if (ips.length > 0) {
    console.log('  局域网访问（同事可用）:');
    for (const { name, ip } of ips) {
      console.log(`    http://${ip}:${PORT}  (${name})`);
    }
  } else {
    console.log('  ⚠ 未检测到局域网 IP，同事可能无法访问');
  }

  console.log(`  数据文件: ${NEWS_FILE}`);
  console.log('══════════════════════════════════════════');
});
