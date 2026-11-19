# 校园小铺（Campus Sales Platform）

一套面向校园场景的三端商品销售平台：**用户端**自助浏览下单、**生产端**接单与打包配送、**管理端**做商品、支付核验、赠货码和订单运营。没有真实支付/物流接口，靠「收款码 + 支付截图 + 浏览器端 OCR 识别单号」完成闭环。

## 三端入口

| 入口 | 路径 | 登录方式 |
| --- | --- | --- |
| 用户端 | `/` | 免登录浏览加购；下单/查订单用「姓名 + 班级 + 座号」 |
| 生产端 | `/portal` | 用户名 + 学号 + 密码（分外部生产 / 内部打包配送） |
| 管理端 | `/admin` | 用户名 + 学号 + 密码（`super_admin` / `admin`） |

## 功能概览

- **用户端**：商品列表与详情、规格/颜色切换、购物车、结算（收货班级、配送方式、时间段、联系方式）、微信/支付宝扫码示例、上传支付截图并本地 OCR 识别单号、赠货码免支付、我的订单与状态追踪。
- **生产端**：外部生产按单项商品接单并上报生产状态；内部生产按订单聚合并上报打包/配送状态，状态与时间线全程留痕。
- **管理端**：账号管理与角色分配、订单检索与详情、支付核验、赠货码生成与核销、删除订单需至少 2 个不同超管确认（软删除归档）、审计日志、站点设置、数据备份导出/导入。
- **安全机制**：JWT + HttpOnly Cookie 会话、scrypt 加盐密码、库存/支付/赠货码次数用事务保证一致。

## 技术栈

- **后端**：Node.js 20+（实测 24）、Express 5、`sql.js`（WASM SQLite，单文件 `app.db`）、`jose` 签发 JWT
- **前端**：原生 ES Module + Hash 路由，无构建步骤；三端共用一套设计系统
- **OCR**：浏览器端 `tesseract.js`，识别失败可手动填单号
- **零外部服务依赖**：不需要数据库服务器，数据和上传文件都在本地目录

## 快速开始

```bash
npm install
npm start            # 默认 http://0.0.0.0:3000
```

首次启动自动建表，并写入默认超级管理员账号（定义在 `server/db.js` 的 `seedStaff()`）：

| 用户名 | 学号 | 密码 |
| --- | --- | --- |
| `admin` | `20260000` | `Admin123` |

这是公开演示用的初始账号，**正式部署后请立即登录管理端修改密码。**

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | 系统临时目录 | 数据目录，`app.db` 所在。**生产环境务必显式指定**，否则重启后数据丢失 |
| `UPLOAD_DIR` | 系统临时目录 | 支付截图等上传文件的存放目录 |
| `SEED_DEMO` | 未设置 | 设为 `1` 时额外写入演示商品/用户/订单/赠货码，便于本地体验 |

### 冒烟测试

```bash
npm run smoke        # 在临时数据目录起一个 3100 端口的实例，跑完整下单-核验-生产-删除审批链路
```

## 目录结构

```
server/          Express 应用
  index.js       入口：中间件、静态资源、路由挂载
  db.js          建表、列迁移、种子数据
  auth.js        密码哈希与 JWT 会话
  routes/        auth / products / orders / production / admin / giftcodes / settings / uploads
  lib/           sql.js 封装、审计、事件、赠货码、设置校验、上传
public/          三端前端（无构建）
  index.html     用户端      js/views/
  portal.html    生产端      js/portal/views/
  admin.html     管理端      js/admin/views/
scripts/smoke.js 端到端冒烟测试
```

## 部署

单机部署只需一个常驻进程 + 数据目录。生产建议用 systemd 托管：

```ini
[Service]
User=youruser
WorkingDirectory=/opt/campus-store
Environment=PORT=3000
Environment=DATA_DIR=/opt/campus-store/data
Environment=UPLOAD_DIR=/opt/campus-store/data/uploads
ExecStart=/usr/bin/node server/index.js
Restart=always
```

公网入口可通过任意反向代理或 Cloudflare Tunnel 指向 `127.0.0.1:3000`，无需额外开放入站端口。

### 更新

```bash
git pull && npm ci --omit=dev
sudo systemctl restart campus-store
```

> `app.db` 是运行时数据，已被 `.gitignore` 忽略；升级前可在管理端「设置 → 数据备份」导出，或直接备份 `DATA_DIR`。
