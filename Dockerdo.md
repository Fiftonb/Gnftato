### 5. 使用Docker部署

本项目支持使用Docker进行容器化部署，方便在不同环境中快速启动服务。

#### 5.1 构建Docker镜像(不想构建直接从5.5看)

```bash
# 在项目根目录下执行
docker build -t nftato-app .
```

#### 5.2 运行Docker容器

基本运行命令：

```bash
docker run -d -p 3001:3001 --name nftato-container nftato-app
```

#### 5.3 数据持久化

为了确保数据持久化（包括服务器配置、用户数据等），需要挂载数据目录：

```bash
# 在项目根目录下
# 确保数据目录存在
mkdir -p $(pwd)/server/data

# 运行容器并挂载数据目录
docker run -d -p 3001:3001 \
  -v $(pwd)/server/data:/app/server/data \
  -v $(pwd)/server/config.json:/app/server/config.json \
  --name nftato-container nftato-app
```

#### 5.4 使用Docker卷实现更好的数据管理（可选）

```bash
# 创建数据卷
docker volume create nftato-data

# 使用数据卷运行容器
docker run -d -p 3001:3001 \
  -v nftato-data:/app/server/data \
  -v $(pwd)/server/config.json:/app/server/config.json \
  --name nftato-container nftato-app
```

#### 5.5 从Docker Hub直接拉取镜像（无需本地构建）

您也可以直接从Docker Hub拉取预构建的镜像：

```bash
# 拉取镜像
docker pull fiftonb/gnftato:latest

# 运行容器
docker run -d -p 3001:3001 \
  -v $(pwd)/server/data:/app/server/data \
  -v $(pwd)/server/config.json:/app/server/config.json \
  --name nftato-container fiftonb/gnftato:latest
```

这种方式无需在本地构建镜像，可以直接使用已发布的镜像运行应用。

#### 5.6 设置环境变量

您可以通过环境变量自定义应用配置：

```bash
# 使用-e选项设置单个环境变量
docker run -d -p 3001:3001 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your_custom_secret \
  -v $(pwd)/server/data:/app/server/data \
  --name nftato-container fiftonb/gnftato:latest
```

或者使用环境变量文件：

```bash
# 创建.env文件
cat > .env << EOL
NODE_ENV=production
JWT_SECRET=your_custom_secret
PORT=3001
CORS_ORIGIN=*
EOL

# 使用环境变量文件运行容器
docker run -d -p 3001:3001 \
  --env-file .env \
  -v $(pwd)/server/data:/app/server/data \
  --name nftato-container fiftonb/gnftato:latest
```

可用的环境变量及其说明：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| PORT | 服务器监听端口 | 3001 |
| HOST | 服务器监听地址 | 0.0.0.0 |
| NODE_ENV | 运行模式 | development |
| JWT_SECRET | JWT签名密钥 | iptato-secure-jwt-secret-key |
| JWT_EXPIRES_IN | JWT过期时间 | 7d |
| CORS_ORIGIN | CORS允许的源 | * |
| STABLE_MODE | 稳定模式 | true |

#### 5.7 查看容器日志

```bash
docker logs nftato-container
```

#### 5.8 停止和重启容器

```bash
# 停止容器
docker stop nftato-container

# 重启容器
docker start nftato-container

# 删除容器（数据卷不会被删除）
docker rm nftato-container
```