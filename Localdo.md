# 本地安装与开发

使用 Node.js 24 LTS 和 npm 11 以上。在项目根目录执行：

```sh
npm ci
npm --prefix server ci
npm --prefix client ci
```

首次配置时复制 `.env.example` 为项目根目录的 `.env`，已有配置请保留并补充必要字段。将 `JWT_SECRET` 设置为独立随机密钥（可执行 `openssl rand -hex 32` 生成），并设置首次管理员的 `ADMIN_PASSWORD`。新密码去除首尾空白后至少 12 个字符，UTF-8 长度不超过 72 字节；`ADMIN_USERNAME` 默认是 `admin`。

```sh
npm --prefix server run create-admin
npm run build
npm start
```

生产静态文件生成于 `server/public`，访问 `http://localhost:3001`。已有管理员的密码不会被初始化覆盖；日后通过面板修改密码。

开发模式使用两个终端分别执行 `npm run dev:server` 与 `npm run dev:client`，或用 `npm run dev` 同时运行。Vite 默认仅监听本机 `http://localhost:8080`，代理 API 与 Socket.IO 到 `127.0.0.1:3001`。生产运行以 `NODE_ENV=production` 启动后端。

验证命令：

```sh
npm test
npm --prefix client run lint
npm --prefix client run test:e2e
npm run build
```

浏览器回归首次运行需按 Playwright 提示安装 Chromium。测试使用临时数据与模拟 SSH，不操作受管理服务器。升级现有安装前请阅读[安全升级与部署迁移](docs/security-upgrade.md)。
