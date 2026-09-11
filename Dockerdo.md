# Docker 部署

此修复需要从当前源码构建镜像；仓库中的修改不会自动发布到 Docker Hub，也不会更新已经运行的容器。

```sh
docker build -t gnftato:security .
```

镜像使用 Node.js 24，前端 Vue 3/Vite 在独立阶段构建，运行镜像只安装后端生产依赖。`.env`、`server/config.json`、本地数据和 `node_modules` 不会打包进镜像。

准备项目根目录 `.env`，参考 `.env.example` 填写随机 `JWT_SECRET`，首次部署还需要 `ADMIN_PASSWORD` 和可选 `ADMIN_USERNAME`。使用 `openssl rand -hex 32` 可以生成密钥；不要使用示例占位值。新密码至少 12 个非首尾空白字符且 UTF-8 不超过 72 字节。

```sh
docker run -d --name gnftato \
  --env-file .env \
  -e NODE_ENV=production \
  -e DATA_DIR=/app/server/data \
  -p 3001:3001 \
  -v /absolute/path/to/data:/app/server/data \
  gnftato:security
```

将挂载源替换为实际绝对路径。升级时先备份并继续挂载旧数据目录；现有 `isAdmin: true` 的管理员及密码保持不变，无需重复设置初始密码。更换 JWT 密钥后需要重新登录。

使用 Docker 卷时可将绑定挂载替换为 `-v gnftato-data:/app/server/data`。通过反向代理访问时，可使用 `-p 127.0.0.1:3001:3001`，在代理侧提供 HTTPS。跨域前端需将 `CORS_ORIGIN` 设置为实际来源。

```sh
docker logs --tail 100 gnftato
```

完整配置、普通用户升级策略及验证步骤见[安全升级与部署迁移](docs/security-upgrade.md)。首次缺少管理员配置或 JWT 密钥不符合要求时，容器会明确报错退出，不再启用固定默认密码。
