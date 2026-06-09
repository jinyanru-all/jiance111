# 国家农业科技创新联盟 · 实时监测系统

定时抓取 [国家农业科技创新联盟](https://nastia.caas.cn/lmml/zylm/index.htm) 名录页面，提供 Web 面板实时查看和搜索。

## 线上访问

> 部署到 Vercel 后，所有人通过同一个 URL 访问：

```
https://你的项目名.vercel.app
```

## 本地运行

```bash
npm install

# 启动监测 + Web 面板（同一局域网同事可访问）
npm run start      # 监测器，每 5 分钟抓取
npm run web        # Web 面板，http://localhost:3000
```

## 部署到线上（Vercel）

### 1. 推送到 Gitee

```bash
git remote add origin https://gitee.com/你的用户名/newsall.git
git branch -M main
git push -u origin main
```

### 2. 部署到 Vercel

1. 打开 [vercel.com](https://vercel.com) → 用 Gitee 账号登录
2. **Add New → Project** → 导入 `newsall` 仓库
3. 直接点 **Deploy**

### 3. 设置 Blob 存储

1. Vercel Dashboard → **Storage** → 创建 **Blob** 存储
2. 连接到你刚部署的项目

### 4. 设置环境变量

Vercel → Settings → Environment Variables：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `BLOB_READ_WRITE_TOKEN` | （自动生成） | 连接 Blob 后自动填入 |

### 5. 重新部署

设置完环境变量后，在 Vercel 点 **Redeploy**。定时抓取会自动启动。

## 项目结构

```
├── monitor.js          # 本地监测脚本（可独立运行）
├── web.js              # 本地 Web 面板（Express）
├── lib/
│   └── scraper.js      # 共享抓取模块
├── api/
│   ├── cron.js         # Vercel Cron 定时抓取
│   ├── news.js         # GET /api/news
│   ├── stats.js        # GET /api/stats
│   └── scrape.js       # POST /api/scrape（手动触发）
├── public/
│   └── index.html      # Web 面板前端
├── data/
│   ├── news.json       # 联盟数据（自动生成）
│   └── seen.json       # 去重记录（自动生成）
└── vercel.json         # Vercel 配置（含 cron）
```

