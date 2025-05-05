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

> 需要注意，使用同类用到nftables命令的工具会使规则冲突。清除规则则可以夺回控制权。脚本首次运行默认只放行ssh端口，且ssh端口无法取消放行。

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
- **前端**：Vue.js 2.x、Element UI、Axios、Vuex状态管理
- **通信**：RESTful API
- **认证**：基于JWT的用户认证系统

## 系统要求

- Node.js 12.x以上
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

系统采用固定管理员模式，不支持开放注册。系统启动时会自动创建默认管理员账户：

- **用户名**: admin
- **密码**: admin123

您也可以通过命令行创建/重置管理员账户：

```bash
cd server
npm run create-admin
```

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

- 登录系统后请立即修改默认管理员密码
- 确保JWT密钥安全，不要使用默认的密钥
- 请确保使用安全的密码
- 建议使用SSH密钥认证而非密码认证
- 服务器连接信息（特别是密码和私钥）存储在本地JSON文件中


## 项目参考

本项目基于[GiPtato](https://github.com/Fiftonb/GiPtato)开发，内核脚本从iptables迁移到nftables的升级版本。
> 使用nftables替代iptables实现更现代化的防火墙管理。

不使用面板只想使用脚本(完善后的脚本)

```bash
wget -N --no-check-certificate https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh && bash Nftato.sh
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



