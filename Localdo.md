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