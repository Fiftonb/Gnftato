# GNftato Panel - 多服务器防火墙规则管理面板

基于Nftato.sh脚本开发的可视化多服务器防火墙规则管理面板，支持通过SSH远程连接管理多台服务器的nftables规则。

> 前端现在也不是很满意，但是，也就这样了（能用）
> 另外关于测试用例覆盖啥的将就吧，精力不够，还是能用就行了
> 有能力的自己二开吧，虽然代码像坨屎，能跑就行...

## 功能特色

- **多服务器管理**：集中管理多台服务器的防火墙规则
- **出网控制**：封禁/解封 SPAM端口、自定义端口
- **入网控制**：管理入网端口和IP白名单
- **SSH远程控制**：通过SSH安全连接到远程服务器执行命令
- **可视化操作**：直观的界面操作替代复杂的命令行管理
- **状态监控**：实时查看各服务器的连接状态和规则列表
- **登录认证**：用户身份验证，保护管理界面安全
- **DDOS防御**：借鉴Goedge防御规则实现的脚本防御

> 首次初始化和“清空所有规则”（重建 Gnftato 规则）默认放行 SSH、80/tcp 和 443/tcp；SSH 端口不能通过面板取消放行。HTTP/HTTPS 端口可在面板中单独关闭，普通保存和重载不会重新开放已关闭的端口。

### Docker 与 Web 入口

- 默认允许 `docker0` 和 `br-*` bridge 发起转发连接及 `established,related` 回包，不依赖外网网卡名称；初始化后新建的同名 bridge 也适用。Docker 自身的隔离规则仍然生效。
- 初始化、重建和保存仅管理 `inet filter`、`inet mangle`、`ip edge_dft_v4`、`ip6 edge_dft_v6`，保留 Docker 的 NAT/转发规则，不把 Docker 动态规则写进持久化快照。使用同名表的其他防火墙仍可能冲突。
- 转发链仍默认拒绝其他流量。Docker 发布端口的入站流量经过 `forward`，宿主机的 80/443 放行规则仅作用于 `input`；本次出站兼容不会自动开放容器发布端口。自定义 bridge 名称需要额外配置转发规则。
- 面板直接使用 `3001`（项目默认端口）或其他非标准端口时，首次运行/重建前用 `NFTATO_WEB_PORTS` 指定额外 TCP 端口；由宿主机 80/443 反向代理访问则无需额外指定：

```sh
NFTATO_WEB_PORTS=3001,8443 bash Nftato.sh
# 自动初始化/重建（会重置 Gnftato 自定义规则）
AUTOMATED=yes NFTATO_WEB_PORTS=3001,8443 bash Nftato.sh 20
```

初始化规则以一个 nftables 事务生效，避免设置默认拒绝后再逐条开放 SSH/Web 的空窗。保存只写入本项目的规则，并覆盖 nftables 服务默认的全局清空停止行为；停止该服务会保留当前规则，重启会重新加载本项目的规则。

已安装旧版的服务器需要更新远程 `Nftato.sh` 后再重建；重建会恢复上述默认规则，请先记录需要保留的自定义规则。若旧版已清除了 Docker NAT 规则，新版不能推导恢复 Docker 的动态状态，需要在维护窗口重启 Docker 以重建其网络规则。

## TODO

- [X] Debian11+ 脚本测试通过
- [X] Ubuntu20+ 脚本测试通过
- [X] Centos9+ 脚本测试通过  
- [X] 重写前端业务逻辑
- [X] 优化部署脚本指令
- [X] 自动更新核心代码功能
- [ ] 一键清除黑白名单
- [ ] 获取黑白名单IP列表
- [ ] 批量导入IP添加黑白名单
- [ ] 实现端口转发
- [X] 完善部署文档
- [X] 搭建预览链接

## 技术栈

- **后端**：Node.js、Express、SSH2、本地JSON存储、JWT认证
- **前端**：Vue.js 3、Element Plus、Vite、Axios、Vuex状态管理
- **通信**：RESTful API、带身份校验的 Socket.IO
- **认证**：基于JWT的用户认证系统

## 系统要求

- Node.js 24 LTS、npm 11 以上
- 远程服务器需支持SSH连接

## 安装部署

### 1. 克隆项目

```bash
git clone https://github.com/Fiftonb/Gnftato.git
cd Gnftato
```
Clawcloud Run云平台部署教程=>[点击查看](https://github.com/Fiftonb/Gnftato/blob/main/Clawcloud.md)

Docker部署教程=>[点击查看](https://github.com/Fiftonb/Gnftato/blob/main/Dockerdo.md)

本地环境部署教程=>[点击查看](https://github.com/Fiftonb/Gnftato/blob/main/Localdo.md)

## 用户认证

系统不支持匿名注册。首次启动前，在根目录 `.env` 或进程环境中设置随机 `JWT_SECRET` 和 `ADMIN_PASSWORD`；用户名由 `ADMIN_USERNAME` 指定，默认为 `admin`，没有默认密码。已有 `isAdmin: true` 的管理员账号及密码会保留。

管理员可通过面板创建账户；普通账户仅能访问个人资料和修改自己的密码。也可通过命令行初始化管理员（不会覆盖已有密码或自动提升普通账户权限）：

```bash
cd server
npm run create-admin
```

升级已有部署请先阅读[安全升级与部署迁移](docs/security-upgrade.md)，其中包含数据保留、密钥配置和验证步骤。首次本地启动前也需要运行一次上述初始化命令。

## 服务访问

- 前端界面: http://localhost:8080 (开发模式)或 http://localhost:3001 (生产模式)
- 后端API: http://localhost:3001/api

## 使用演示

使用演示=>[点击查看](https://github.com/Fiftonb/Gnftato/blob/main/USE.md)

## 功能说明

### 放行IP与IP黑白名单的区别

系统提供两种IP管理功能，它们服务于不同的目的：

1. **放行IP (入网方向功能 - 第17项)**
   - 作用于基本防火墙层面，控制哪些IP可以访问服务器
   - 如果服务器防火墙默认策略是拒绝(DROP)，只有被放行的IP才能建立连接
   - 未被放行的IP会被基本防火墙直接拒绝访问
   - 命令实现: `nft add rule inet filter input ip saddr $IP accept`

2. **IP黑白名单 (DDoS防御功能 - 第24项)**
   - 作用于DDoS防御层面，位于基本防火墙之后
   - **白名单IP**: 可以绕过DDoS防御检测，不受连接频率和数量限制
   - **黑名单IP**: 被直接拒绝，不论连接次数和频率
   - IP必须先通过基本防火墙(被放行或防火墙默认允许)，才会到达DDoS防御层

使用建议:
- 如果服务器设置为默认拒绝所有连接，需要先使用"放行IP"功能
- 如果已开启DDoS防御，对于需要频繁访问的可信IP，建议添加到白名单
- 如果只需简单的访问控制，使用"放行IP"即可
- 如果需要防御DDoS攻击同时允许特定IP不受限制，应使用白名单功能

## 安全提示

- 从旧版升级时，如果仍使用历史默认管理员密码，请通过面板修改
- 确保JWT密钥安全，不要使用默认的密钥
- 请确保使用安全的密码
- 建议使用SSH密钥认证而非密码认证
- 服务器连接信息（特别是密码和私钥）存储在本地JSON文件中


## 项目参考

本项目基于[GiPtato](https://github.com/Fiftonb/GiPtato)开发，内核脚本从iptables迁移到nftables的升级版本。
> 使用nftables替代iptables实现更现代化的防火墙管理。

不使用面板只想使用脚本(完善后的脚本)

```bash
wget -N https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh && bash Nftato.sh
```
二次使用目录下执行
```sh
./Nftato.sh
```

## 免责声明

* 此项目开发目的为本人自用，因此本人不能保证向后兼容性。
* 由于本人能力有限，不能保证所有功能的可用性，如果出现问题请在Issues反馈。
* 本人不对任何人使用本项目造成的任何后果承担责任。
* 本人比较多变，因此本项目可能会随想法或思路的变动随性更改项目结构或大规模重构代码，若不能接受请勿使用。

## 许可证

MIT License

## Stargazers over time
[![Stargazers over time](https://starchart.cc/Fiftonb/Gnftato.svg?variant=adaptive)](https://starchart.cc/Fiftonb/Gnftato)


