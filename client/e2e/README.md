使用 Node 24 和 npm 11，在 client 目录运行：

```sh
npm ci
npm exec playwright install chromium --only-shell
npm run test:e2e
```

测试会在系统临时目录构建生产前端，启动仅监听 127.0.0.1:4176 的预览服务，并在结束后清理临时构建。所有 API 和 Socket.IO 都由 Playwright 拦截；无需后端、账号数据库或 SSH 服务器。

覆盖管理员登录、服务器编辑/新增/认证方式切换、移动端列表、首次规则加载/SSH端口保护/规则提交、IP弹窗、修改密码并更新令牌、管理员创建账号保持会话、普通用户权限、过期登录，以及 Socket.IO 令牌握手/日志/鉴权失败后的延迟回退拦截。

这些测试验证前端和约定的接口协议；真实后端鉴权与 SSH 行为应由后端测试另外覆盖。
