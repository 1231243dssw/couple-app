# 部署到公网（两人异地随时能连）

要让两台手机用各自流量也能实时互发思念，后端必须跑在一台**有公网 IP 的服务器**上，并配上 **HTTPS / WSS**。

本项目已是「零改动即可部署」状态：
- 监听 `0.0.0.0:$PORT`（默认 3000），支持 `PORT` 环境变量
- 不依赖外部数据库（JSON 文件持久化，可用挂载卷永久保存）
- 仓库根目录已带 `railway.json` 与 `render.yaml`，连上仓库即自动按配置部署

下面任选一个平台，几分钟上线。

---

## 第 0 步：把代码推到你自己的 GitHub（我无法代为登录你的云账号）

本项目已在本地初始化好 git 仓库并已提交。你只需：

```bash
cd couple-app
# 1. 在 GitHub 新建一个空仓库（不要勾 README），拿到地址后：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
# 2. 推送
git push -u origin main
```

> 若你是在自己电脑上拿到这份代码，直接在本目录执行上面三条即可。
> 推送后 `backend/node_modules` 与 `backend/data` 已被 `.gitignore` 排除，不会入库。

---

## 方式一：Railway（推荐，最省心）

1. 打开 https://railway.app ，用 GitHub 登录
2. 「New Project」→「Deploy from GitHub repo」→ 选你刚推的仓库
3. Railway 会自动读取根目录的 `railway.json`：
   - `rootDirectory: backend`（只部署后端）
   - `startCommand: node server.js`
   - 健康检查 `/api/health`
   - 环境变量 `PORT=3000`、`DATA_DIR=/data`
4. 部署完成后，Railway 给一个地址如 `https://couple-miss-backend.up.railway.app`
5. 持久化（可选）：Railway 控制台给服务加一块 **Volume**，挂载到 `/data`，这样思念数据、日记、卡片进度永久保存（不挂盘也能跑，重启会重置数据）

## 方式二：Render

1. 打开 https://render.com ，用 GitHub 登录
2. 「New」→「Blueprint」→ 选你的仓库（Render 会读 `render.yaml`）
   或「New」→「Web Service」→ 关联仓库，Root Directory 填 `backend`
3. 配置已写在 `render.yaml` 里：Node 运行时、`npm install`、`node server.js`、端口 3000、健康检查 `/api/health`
4. 完成后得到 `https://couple-miss-backend.onrender.com`
5. 持久化（可选）：在 Render 面板给服务挂一块 **Render Disk**，挂载路径 `/data`（与 `DATA_DIR` 一致）

> 免费额度提示：Render 免费版在闲置约 15 分钟后会休眠，对方第一次发思念时会有 ~30 秒冷启动；Railway 新账号的免费额度以官网为准。介意的话用上面“方式三”自有云更稳。

---

## 第 N 步：让小程序连上公网地址（必做）

拿到公网地址（以 `xxxx` 代替）后，改两处：

### 1) `miniprogram/app.js`（约第 7-8 行）
```js
serverUrl: 'https://xxxx.up.railway.app',   // 或 https://xxxx.onrender.com
wsUrl:     'wss://xxxx.up.railway.app',     // 注意是 wss
```
（小程序也内置了 `setServer()` 方法，可在“设置页”里填地址后存本地，不必每次改代码。）

### 2) 微信公众平台 → 开发管理 → 开发设置 → 服务器域名（上线必填）
- `request 合法域名` 加入：`https://xxxx.up.railway.app`
- `socket 合法域名` 加入：`wss://xxxx.up.railway.app`

> 本地调试阶段可跳过域名白名单：微信开发者工具顶部勾选「不校验合法域名、TLS 版本以及 HTTPS 证书」即可用 `http/ws` 或局域网 IP 联调。

---

## 方式三：自有云服务器（腾讯云 / 阿里云，最稳）

```bash
git clone <你的仓库> && cd couple-app/backend
npm install
npm install -g pm2
pm2 start server.js --name couple-backend
pm2 save
```
再在 Nginx 上做反代，把 `https://你的域名` 和 `wss://你的域名` 指到 `localhost:3000`，并配置 SSL 证书；最后在微信后台把你的域名加入白名单。

---

## 数据会不会丢？

- 代码层面：所有思念、日记、卡片、定时情话都落盘到 `DATA_DIR`（默认 `backend/data/db.json`）。
- 免费托管实例的文件系统是临时的，**重新部署/重启会清空该目录**，除非你挂了卷（Railway Volume / Render Disk，挂载到 `/data`）。
- 想要永久保存：按上面“持久化（可选）”挂一块盘即可，零代码改动。
