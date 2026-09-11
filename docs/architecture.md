# Gnftato 架构说明

## 设计结论

`Nftato.sh` 作为可直接下载、复制到远程服务器执行的发布文件，保持单文件是合理的；把它作为唯一源码长期维护则不合理。项目因此采用“模块化源码 + 单文件构建产物”：开发代码位于 `scripts/nftato-src/`，`Nftato.sh` 与 `server/scripts/Nftato.sh` 都由构建脚本生成。

面板采用模块化单体。前后端仍可一起部署，不引入微服务的运维成本，但界面、状态、SSH 连接、命令执行和远程脚本协议各有明确边界。

## 前端边界

- `src/views/` 只负责页面编排和生命周期。
- `src/components/firewall/`、`src/components/servers/` 负责展示及事件上报。
- `src/features/firewall/` 保存防火墙领域状态、查询、变更、部署和连接逻辑。
- `src/features/servers/` 保存服务器 API、状态归一化、状态监视及页面组合逻辑。
- `src/store/modules/servers.js` 是服务器列表和连接状态在前端的唯一事实来源。页面不再复制服务器列表，也不从日志文案或 `localStorage` 推断在线状态。

路由页面按需加载，Element Plus 组件也按需解析，避免规则页和服务器页代码全部进入首屏包。

## 后端边界

- Controller 只做 HTTP 参数提取、状态码和响应映射。
- `ConnectionManager` 管理 SSH 生命周期和内存连接状态。
- `CommandExecutor` 管理超时、输出和重试策略。
- `FileTransferService` 管理 SFTP 文件传输。
- `DeploymentService` 管理脚本校验、安装和初始化流程。
- `nftatoCommandRegistry` 集中定义命令名称、旧数字编号、只读属性、参数校验和 shell quoting。
- `PerServerMutationQueue` 串行化同一服务器上的防火墙变更；不同服务器仍可并行。
- `NftablesService` 提供面向 Controller 的领域操作并兼容现有 API 响应。

后端内存中的实际 SSH 连接是在线状态的事实来源。持久化的服务器记录只保存配置和最后连接时间，进程重启后不会把旧的 `online` 值误当成有效连接。

只读命令可以在瞬时 SSH 故障后重试。变更命令一旦发往远端便不自动重试；连接中断、超时或结构化响应损坏会返回 `outcomeUnknown`，由用户检查现状后决定下一步，避免重复添加或删除规则。

## 远程脚本协议

推荐使用命名命令，例如：

```sh
./Nftato.sh outbound:block-ports 25,465
./Nftato.sh inbound:allow-addresses 192.0.2.10/32
./Nftato.sh --json ddos:status
```

JSON 模式返回稳定的 `success`、`command`、`exitCode` 和 `output` 字段。后端会先以只读方式探测该能力，新脚本使用命名命令和 JSON；已部署的旧脚本继续使用数字命令，因此升级面板不会立即中断旧服务器。

端口、IP/CIDR、关键词和 DDoS 参数在命令注册表与 Shell 入口两侧校验。任何新增面板命令都应先进入注册表，不能在 Controller 或页面中拼接 shell 参数。

部署使用项目随附的脚本，通过 SFTP 上传到随机临时路径，校验 SHA-256 后再移动到目标位置。上传和初始化也进入同一服务器的变更队列。

## Shell 源码与发布

模块按运行时、基础规则、出网、入网、DDoS、CLI 和入口划分。修改后执行：

```sh
npm run build:nftato
npm run check:nftato
```

`build:nftato` 生成两个相同的单文件发布目标；`check:nftato` 用于 CI，防止提交的发布文件落后于模块源码。不得直接只修改某一个生成文件。

## 验证

`npm test` 覆盖后端、前端领域逻辑和 Shell CLI；`npm run test:integration` 覆盖真实浏览器与 HTTP API；`npm run test:firewall` 在特权 Docker 容器内验证 nftables、网络命名空间、Docker 转发、规则持久化和错误路径。
