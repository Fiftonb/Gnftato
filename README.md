# GNftato Panel - 多服务器防火墙规则管理面板

基于Nftato.sh脚本开发的可视化多服务器防火墙规则管理面板，支持通过SSH远程连接管理多台服务器的nftables规则。

> 不建议使用关键词封禁功能（iptables实现），效率很低，会导致某些应用连接超时

## 功能特色

- **多服务器管理**：集中管理多台服务器的防火墙规则
- **出网控制**：封禁/解封 BT、PT、SPAM、自定义端口和关键词
- **入网控制**：管理入网端口和IP白名单
- **SSH远程控制**：通过SSH安全连接到远程服务器执行命令
- **可视化操作**：直观的界面操作替代复杂的命令行管理
- **状态监控**：实时查看各服务器的连接状态和规则列表
- **登录认证**：用户身份验证，保护管理界面安全
- **DDOS防御**：借鉴Goedge防御规则实现的脚本防御

> 需要注意，使用同类用到nftables命令的工具会使规则冲突。清除规则则可以夺回控制权。脚本首次运行默认只放行ssh端口，且ssh端口无法取消放行。

## TODO

- [ ] 实现端口转发

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

### 2. 安装依赖

安装nodejs环境（建议debian11+系统）:

```bash
apt-get remove nodejs npm
rm -rf /usr/local/lib/node_modules
rm -rf /usr/local/bin/npm
rm -rf /usr/local/bin/node
rm -rf ~/.npm
source <(curl -L https://nodejs-install.netlify.app/install.sh) -v 22.2.0
```

一键安装所有依赖:

```bash
npm run setup
```

可直接看第四步骤

### 3. 配置环境变量(项目自带可忽略)

复制`.env.example`文件为`.env`，或直接创建`.env`文件，并根据实际情况修改:

```bash
cp .env.example .env
```

配置示例:

```
# 服务器配置
PORT=3001
CORS_ORIGIN=http://localhost:8080

# 数据目录配置
DATA_DIR=./server/data

# JWT配置
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=7d

# 日志配置
LOG_LEVEL=info
LOG_DIR=./logs

# 临时文件目录
TMP_DIR=./tmp

# 应用模式配置
NODE_ENV=development
# 设置为 true 可避免 nodemon 频繁重启
STABLE_MODE=true
```

### 4. 构建与启动

一键构建前端并启动服务:

```bash
# 构建前端 (将构建结果输出到 server/public 目录)
npm run build

# 启动后端服务器
npm start
```

或使用一键启动脚本(仅开发模式):

```bash
./start-all.sh
```

## 开发模式

同时启动前端和后端开发服务器:

```bash
npm run dev
```

## 服务访问

- 前端界面: http://localhost:8080 (开发模式)或 http://localhost:3001 (生产模式)
- 后端API: http://localhost:3001/api

## 用户认证

系统采用固定管理员模式，不支持开放注册。系统启动时会自动创建默认管理员账户：

- **用户名**: admin
- **密码**: admin123

您也可以通过命令行创建/重置管理员账户：

```bash
cd server
npm run create-admin
```

## 使用指南

1. 访问前端界面，使用管理员账户登录系统
2. 登录后进入服务器管理界面
3. 添加服务器：点击"添加服务器"，填写服务器信息并测试连接
4. 连接服务器：在服务器列表中点击"连接"按钮
5. 管理规则：点击"管理规则"进入相应服务器的规则管理页面
6. 根据需要配置出入网规则

## 安全提示

- 登录系统后请立即修改默认管理员密码
- 确保JWT密钥安全，不要使用默认的密钥
- 请确保使用安全的密码
- 建议使用SSH密钥认证而非密码认证
- 服务器连接信息（特别是密码和私钥）存储在本地JSON文件中

## 许可证

MIT License

## 项目参考

本项目基于[GiPtato](https://github.com/Fiftonb/Gnftato)开发，内核脚本从iptables迁移到nftables的升级版本。
> 使用nftables替代iptables实现更现代化的防火墙管理。

不使用面板只想使用脚本(完善后的脚本)

```bash
wget -N --no-check-certificate https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh && bash Nftato.sh
```
二次使用目录下执行
```sh
./Nftato.sh
```

## 功能简介
### 适配系统
Debian\Centos\Ubuntu


