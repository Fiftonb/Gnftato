# 安全升级与部署迁移

此次升级保留原有 JSON 数据目录、管理员密码和服务器配置。生产环境使用 Node.js 24；Docker 默认以 `NODE_ENV=production` 启动。前端单独构建，最终镜像只包含后端生产依赖和前端静态文件。

## 升级前准备

1. 备份当前 `DATA_DIR`，尤其是 `users.json`、`servers.json` 和 `rules.json`，以及部署环境的密钥配置。部署新镜像时继续挂载原来的数据目录。
2. 为 `JWT_SECRET` 设置独立随机密钥，可用 `openssl rand -hex 32` 生成。缺少密钥、使用旧默认值或密钥强度不足时，启动会明确失败。更换密钥后，用户需要重新登录。
3. 确认数据中至少有一个 `isAdmin: true` 的管理员。此类现有账号的密码不会被初始化脚本覆盖，也不要求重新设置 `ADMIN_PASSWORD`。若旧管理员仍在使用公开的默认密码，需通过面板修改密码。
4. 如果数据中只有普通用户或历史上没有 `isAdmin` 标记的用户，配置一个未占用的 `ADMIN_USERNAME` 和新的 `ADMIN_PASSWORD` 创建管理员。程序不会把现有普通用户自动提升为管理员。

固定初始密码已经取消；账号初始化以本文和 `.env.example` 为准。

## 首次部署或补建管理员

首次部署可复制 `.env.example` 为 `.env`，然后填写 `JWT_SECRET`、`ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。已有部署请直接补充现有配置，不覆盖原配置或数据文件。

`ADMIN_USERNAME` 默认是 `admin`。新管理员密码去除首尾空白后至少需要 12 个字符，且 UTF-8 编码不超过 72 字节。启动脚本先执行管理员初始化；没有管理员且缺少密码时会立即退出，不会带着未初始化的账号继续启动。密码不会输出到日志中。

也可以在已安装后端依赖的本地环境执行：

```sh
cd server
npm run create-admin
```

该命令读取同一份环境配置。指定的账号若已经是管理员，则保留其原密码；若同名账号是普通用户，则明确报错，需要改用未占用的用户名。它不提供重置已有账号密码的功能。管理员创建成功后可以从环境中移除 `ADMIN_PASSWORD`；后续通过面板修改密码。

配置由 `server/config/runtime.js` 统一加载，进程环境变量优先；本地文件首先读取项目根目录 `.env`，不存在时回退至 `server/config.json`。`server/.env.example` 也是供复制到项目根目录的示例，程序不单独读取 `server/.env`。测试使用 `NODE_ENV=test` 时会跳过本地 `.env` 和 `config.json`；必须在测试环境显式提供随机测试密钥和隔离的 `DATA_DIR`。

## Docker 部署

```sh
docker build -t gnftato:security .
docker run -d --name gnftato \
  --env-file .env \
  -e NODE_ENV=production \
  -e DATA_DIR=/app/server/data \
  -p 3001:3001 \
  -v /absolute/path/to/existing-data:/app/server/data \
  gnftato:security
```

将挂载源替换为实际数据目录；已有容器需在安排好的更新时间替换并复用原有挂载。通过反向代理提供服务时，可将端口绑定改为 `127.0.0.1:3001:3001`。配置 `CORS_ORIGIN` 时使用实际的前端地址。

构建上下文排除了 `.env`、`config.json`、用户数据、日志、本地 `node_modules` 和旧静态构建产物，因此配置必须通过运行时环境变量、`--env-file` 或挂载文件传入。镜像不会携带本地账户、SSH 凭据或旧的 JWT 默认密钥。

`server/start.sh` 使用 POSIX shell，初始化失败即停止，成功后通过 `exec node app.js` 运行后端。容器不再运行 nodemon；本地需要热重载时继续使用 `npm run dev`。

## 更新后的验证

更新前后使用同一份数据目录，检查现有管理员登录、服务器列表、规则读取和实时状态。普通账号应能按允许的账号功能登录，但不能操作受管理服务器；匿名注册和未经认证的实时连接应被拒绝。

自动化回归应使用临时数据和 SSH 模拟连接。真实服务器的部署、防火墙重建和规则写入需要在已安排的维护环境单独验证，不能用线上服务器代替隔离测试。

## 本次代码验证

- Node 内置测试覆盖旧管理员/旧长口令兼容、管理员权限、HTTP 与 Socket.IO 令牌校验和部署互斥、管理员初始化、缓存并发/迁移/失败恢复、模拟 SFTP 上传及部署失败处理。
- Playwright 基于生产构建覆盖服务器表单、规则页面首屏/操作、手机布局、账号创建、改密会话轮换和 Socket.IO 鉴权失败。
- `npm run test:integration` 使用临时数据启动真实后端，与真实浏览器验证登录、创建账号、改密和旧令牌失效。先执行 `npm run build`，并安装前端 Playwright Chromium。
- Docker 镜像在无网络、只读根文件系统和临时数据目录中完成启动、管理员初始化、静态页面和 API 验证。测试没有操作已管理服务器的防火墙。

规则缓存现在写入 `DATA_DIR/rules-cache.json`，兼容读取旧 `rules.json` 中对象形式的缓存，保留原规则记录；多个并行刷新不会互相覆盖。备份时应包含整个数据目录。缓存队列对应当前单 Node 进程的 JSON 存储模式。

缺少远程脚本时，部署通过已有 SSH/SFTP 上传随本次发布携带的 `server/scripts/Nftato.sh`，SHA-256 校验后原子安装。已有远程脚本会复用，不会因为升级面板自动重建规则；需要升级远程脚本时仍应安排维护与备份。

项目的 `.env` 和 `server/config.json` 已移出 Git 跟踪，本地文件保留；后续提交不应重新加入运行配置。历史提交若含曾使用的真实密钥，移出跟踪不会撤销这些值，需要在部署时轮换。
