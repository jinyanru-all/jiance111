/**
 * 联盟页面抓取模块（纯逻辑，无文件 I/O）
 * -------------------------------------
 * 同时被 monitor.js（本地）和 api/cron.js（Vercel）使用
 */
const axios = require('axios');
const cheerio = require('cheerio');

// ===================== 配置 =====================

const CATEGORY_PAGES = [
  { key: 'zhuanye', label: '专业联盟', url: 'https://nastia.caas.cn/lmml/zylm/index.htm' },
  { key: 'chanye',   label: '产业联盟', url: 'https://nastia.caas.cn/lmml/cylm/index.htm' },
  { key: 'quyu',     label: '区域联盟', url: 'https://nastia.caas.cn/lmml/qylm/index.htm' },
];

const REQUEST_TIMEOUT = 15_000;
const ITEM_SELECTOR = 'div.kycglwtablebox ul.clearfix';

// ===================== 工具函数 =====================

function resolveUrl(raw, baseUrl) {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const relative = raw.replace(/^\.\//, '');
  const base = new URL(baseUrl);
  const dir = base.pathname.replace(/\/[^/]*$/, '/');
  return base.origin + dir + relative;
}

function decodeHtml(buffer) {
  let text = Buffer.from(buffer).toString('utf-8');
  if (text.includes('�') || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text.slice(0, 500))) {
    try {
      const iconv = require('iconv-lite');
      text = iconv.decode(Buffer.from(buffer), 'gbk');
    } catch {
      text = Buffer.from(buffer).toString('gbk');
    }
  }
  return text;
}

// ===================== 核心抓取 =====================

/**
 * 抓取单个类别页面
 */
async function fetchCategoryPage(categoryLabel, pageUrl, verbose = false) {
  const items = [];
  try {
    const resp = await axios.get(pageUrl, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      responseType: 'arraybuffer',
    });

    const html = decodeHtml(resp.data);
    const $ = cheerio.load(html);

    if (verbose) {
      console.log(`    ${categoryLabel}: ${html.length} 字符, H2="${$('.routeNav_top h2').text().trim()}"`);
    }

    const $rows = $(ITEM_SELECTOR);
    $rows.each((_, row) => {
      const $row = $(row);
      if ($row.hasClass('kycglwtabletit')) return;
      const style = ($row.attr('style') || '').replace(/\s+/g, '');
      if (style.includes('display:none')) return;

      const $a = $row.find('a').first();
      if ($a.length === 0) return;

      const rawHref = $a.attr('href') || '';
      if (!rawHref || rawHref === '#') return;

      const $lis = $a.find('li');
      if ($lis.length < 2) return;

      const title = ($lis.eq(0).text() || '').trim();
      const dateRaw = ($lis.eq(1).text() || '').trim();
      const org = $lis.length >= 3 ? ($lis.eq(2).text() || '').trim() : '';
      const chair = $lis.length >= 4 ? ($lis.eq(3).text() || '').trim() : '';

      if (!title || title === '联盟名称' || title === '首页') return;

      const url = resolveUrl(rawHref, pageUrl);
      if (!url) return;

      const date = dateRaw.replace(/\./g, '-');

      items.push({ title, url, date, org, chair, category: categoryLabel });
    });
  } catch (err) {
    console.error(`  ⚠ ${categoryLabel} 抓取失败: ${err.message}`);
  }
  return items;
}

/**
 * 抓取所有类别页面
 * @returns {Promise<Map<string, Array>>}
 */
async function fetchAllCategories(verbose = false) {
  const result = new Map();
  for (const cat of CATEGORY_PAGES) {
    const items = await fetchCategoryPage(cat.label, cat.url, verbose);
    result.set(cat.label, items);
    if (verbose) console.log(`  ${cat.label}: ${items.length} 条`);
  }
  return result;
}

// ===================== 增量处理 =====================

/**
 * 将本轮抓取结果合入已有数据
 * @param {Map} allNews - 本轮抓取的 Map
 * @param {Map} existingMap - 已有数据（url → record）
 * @returns {{ merged: Map, newUrls: string[] }}
 */
function mergeNews(allNews, existingMap) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newUrls = [];

  for (const items of allNews.values()) {
    for (const item of items) {
      if (existingMap.has(item.url)) {
        const ex = existingMap.get(item.url);
        ex.lastSeen = now;
        if (item.title) ex.title = item.title;
        if (item.date) ex.date = item.date;
        if (item.org) ex.org = item.org;
        if (item.chair) ex.chair = item.chair;
      } else {
        existingMap.set(item.url, { ...item, firstSeen: now, lastSeen: now });
        newUrls.push(item.url);
      }
    }
  }
  return { merged: existingMap, newUrls };
}

module.exports = { fetchAllCategories, mergeNews, CATEGORY_PAGES };
